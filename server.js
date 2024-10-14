const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const expressSession = require('express-session');
const bcrypt = require('bcryptjs');
const flash = require('connect-flash');
const multer = require('multer');
// Make sure it's capitalized
const User = require('./models/user.model');
const Todo = require('./models/todo.model');

const app = express();
const port = 3000;

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/todolist', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('DB connected successfully');
}).catch((err) => {
    console.log('Database connection error:', err);
});

// Set storage engine
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // specify the folder to store files
        cb(null, './uploads');
    },
    filename: function (req, file, cb) {
        // unique name for each file
        cb(null, Date.now() + '-' + file.originalname);
    }
});

// Init upload
const upload = multer({ storage: storage });


// Body parser middleware
app.use(express.urlencoded({ extended: false }));

// Express session middleware
app.use(expressSession({
    secret: 'my_secret_key',
    resave: false,
    saveUninitialized: true,
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Passport Local Strategy
passport.use(new LocalStrategy({ usernameField: 'username' }, (username, password, done) => {
    User.findOne({ username: username })
        .then(user => {
            if (!user) {
                return done(null, false, { message: 'That username is not registered' });
            }
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) throw err;
                if (isMatch) {
                    return done(null, user);
                } else {
                    return done(null, false, { message: 'Password incorrect' });
                }
            });
        })
        .catch(err => console.log(err));
}));

// Serialize and deserialize user for session management
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err);
    }
});

// Connect flash middleware
app.use(flash());

// Global variables for flash messages
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    next();
});

// Static files middleware
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.use('/uploads', express.static('uploads'));

const title = 'full-stack todo app';


// Routes
app.get('/', ensureAuthenticated, async (req, res) => {
    const todos = await Todo.find(); 
    res.render('index', { todos, title });
});

app.post('/', async (req, res) => {
    const { todoName, desc } = req.body;
    const newTodo = new Todo({ todoName, desc });
    await newTodo.save(); 
    res.redirect('/');
});

// Edit Todo
app.get('/edit/:id', ensureAuthenticated, async (req, res) => {
    const todoId = req.params.id;
    const todo = await Todo.findById(todoId);
    if (todo) {
        res.render('edit', { todo, title });
    } else {
        res.redirect('/');
    }
});

// Update Todo
app.post('/edit/:id', async (req, res) => {
    const todoId = req.params.id;
    const { todoName, desc } = req.body;
    await Todo.findByIdAndUpdate(todoId, { todoName, desc });
    res.redirect('/');
});
// Delete Todo
app.post('/delete/:id', async (req, res) => {
    const todoId = req.params.id;
    await Todo.findByIdAndDelete(todoId);
    res.redirect('/');
});




// Register route
app.get('/register', (req, res) => {
    res.render('register', {title});
});

app.post('/register', async (req, res) => {
    const { username, email, password, password2 } = req.body;
    let errors = [];

    // Validate required fields
    if (!username || !email || !password || !password2) {
        errors.push({ msg: 'Please fill in all fields' });
    }

    // Validate password match
    if (password !== password2) {
        errors.push({ msg: 'Passwords do not match' });
    }

    // Validate password length
    if (password.length < 6) {
        errors.push({ msg: 'Password should be at least 6 characters' });
    }

    if (errors.length > 0) {
        res.render('register', {
            errors,
            username,
            email,
            password,
            password2
        });
    } else {
        try {
            // Check if the user already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                errors.push({ msg: 'Email is already registered' });
                return res.render('register', { errors, username, email, password, password2 });
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Create new user
            const newUser = new User({
                username,
                email,
                password: hashedPassword
            });

            await newUser.save();
            req.flash('success_msg', 'You are now registered and can log in');
            res.redirect('/login');
        } catch (error) {
            console.error(error);
            res.status(500).send('Server error');
        }
    }
});

// Login route
app.get('/login', (req, res) => {
    res.render('login', {title});
});

app.post('/login', (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/profile',
        failureRedirect: '/login',
        failureFlash: true
    })(req, res, next);
});



app.get('/profile', ensureAuthenticated, (req, res) => {
    // Check if the user object exists
    if (!req.user) {
        return res.status(401).send('User not authenticated');
    }

    res.render('profile', {
        user: req.user, 
        title
    });
});

app.post('/profile', upload.single('file'), async (req, res) => {
    try {
        // Check if the user object exists
        if (!req.user) {
            return res.status(401).send('User not authenticated');
        }

        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const imagePath = `/uploads/${req.file.filename}`; 

        // Update the user's imagePath in the database
        await User.findByIdAndUpdate(req.user._id, { imagePath: imagePath });

        res.send('File uploaded and profile updated successfully!');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error updating profile.');
    }
});




// Logout route
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.flash('success_msg', 'You are logged out');
        res.redirect('/login');
    });
});

// Ensure user is authenticated middleware
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash('error_msg', 'Please log in to view this resource');
    res.redirect('/login');
}

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
