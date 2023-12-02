import { Meteor } from 'meteor/meteor';
import { Tasks } from '../lib/collection.js';

Meteor.startup(() => {
  // code to run on server at startup
  Meteor.publish('tasks', function() {
    return Tasks.find({ });
  })
});

Meteor.methods({
  addTask: (name) => {
    Tasks.insert({ name, createdAt: new Date() })
  },
  deleteTask: (_id) => {
    Tasks.remove({ _id })
  }
})