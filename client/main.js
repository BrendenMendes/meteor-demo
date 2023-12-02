import { Template } from 'meteor/templating';
import { Tasks } from '../lib/collection.js';
import './main.html';

Template.tasklist.onCreated(function helloOnCreated() {
  Meteor.subscribe('tasks');
});

Template.tasklist.helpers({
  tasks() {
    return Tasks.find({}).fetch();
  }
});

Template.tasklist.events({
  'click #add'(e) {
    const taskname = document.getElementById('taskname').value;
    if (taskname) {
      Meteor.call('addTask', taskname);
    }
    document.getElementById('taskname').value = "";
  },
  "click #delete"(e) {
    Meteor.call('deleteTask', e.target.value)
  }
});
