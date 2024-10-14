const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema({
    todoName: {
        type: String,
        required: true,
    },
    desc: {
        type: String,
        required: true,
    },
}, { timestamps: true }); // Optional: to track createdAt and updatedAt

const Todo = mongoose.model('Todo', todoSchema);

module.exports = Todo;
