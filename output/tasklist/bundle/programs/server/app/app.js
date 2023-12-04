var require = meteorInstall({"lib":{"collection.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////
//                                                                   //
// lib/collection.js                                                 //
//                                                                   //
///////////////////////////////////////////////////////////////////////
                                                                     //
module.export({
  Tasks: () => Tasks
});
let Mongo;
module.link("meteor/mongo", {
  Mongo(v) {
    Mongo = v;
  }
}, 0);
const Tasks = new Mongo.Collection("tasks");
///////////////////////////////////////////////////////////////////////

}},"server":{"main.js":function module(require,exports,module){

///////////////////////////////////////////////////////////////////////
//                                                                   //
// server/main.js                                                    //
//                                                                   //
///////////////////////////////////////////////////////////////////////
                                                                     //
let Meteor;
module.link("meteor/meteor", {
  Meteor(v) {
    Meteor = v;
  }
}, 0);
let Tasks;
module.link("../lib/collection.js", {
  Tasks(v) {
    Tasks = v;
  }
}, 1);
Meteor.startup(() => {
  // code to run on server at startup
  Meteor.publish('tasks', function () {
    return Tasks.find({});
  });
});
Meteor.methods({
  addTask: name => {
    Tasks.insert({
      name,
      createdAt: new Date()
    });
  },
  deleteTask: _id => {
    Tasks.remove({
      _id
    });
  }
});
///////////////////////////////////////////////////////////////////////

}}},{
  "extensions": [
    ".js",
    ".json"
  ]
});

var exports = require("/server/main.js");
//# sourceURL=meteor://💻app/app/app.js
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1ldGVvcjovL/CfkrthcHAvbGliL2NvbGxlY3Rpb24uanMiLCJtZXRlb3I6Ly/wn5K7YXBwL3NlcnZlci9tYWluLmpzIl0sIm5hbWVzIjpbIm1vZHVsZSIsImV4cG9ydCIsIlRhc2tzIiwiTW9uZ28iLCJsaW5rIiwidiIsIkNvbGxlY3Rpb24iLCJNZXRlb3IiLCJzdGFydHVwIiwicHVibGlzaCIsImZpbmQiLCJtZXRob2RzIiwiYWRkVGFzayIsIm5hbWUiLCJpbnNlcnQiLCJjcmVhdGVkQXQiLCJEYXRlIiwiZGVsZXRlVGFzayIsIl9pZCIsInJlbW92ZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFBQUEsTUFBTSxDQUFDQyxNQUFNLENBQUM7RUFBQ0MsS0FBSyxFQUFDLE1BQUlBO0FBQUssQ0FBQyxDQUFDO0FBQUMsSUFBSUMsS0FBSztBQUFDSCxNQUFNLENBQUNJLElBQUksQ0FBQyxjQUFjLEVBQUM7RUFBQ0QsS0FBSyxDQUFDRSxDQUFDLEVBQUM7SUFBQ0YsS0FBSyxHQUFDRSxDQUFDO0VBQUE7QUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0FBRXJGLE1BQU1ILEtBQUssR0FBRyxJQUFJQyxLQUFLLENBQUNHLFVBQVUsQ0FBQyxPQUFPLENBQUMsQzs7Ozs7Ozs7Ozs7QUNGbEQsSUFBSUMsTUFBTTtBQUFDUCxNQUFNLENBQUNJLElBQUksQ0FBQyxlQUFlLEVBQUM7RUFBQ0csTUFBTSxDQUFDRixDQUFDLEVBQUM7SUFBQ0UsTUFBTSxHQUFDRixDQUFDO0VBQUE7QUFBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDO0FBQUMsSUFBSUgsS0FBSztBQUFDRixNQUFNLENBQUNJLElBQUksQ0FBQyxzQkFBc0IsRUFBQztFQUFDRixLQUFLLENBQUNHLENBQUMsRUFBQztJQUFDSCxLQUFLLEdBQUNHLENBQUM7RUFBQTtBQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7QUFHbklFLE1BQU0sQ0FBQ0MsT0FBTyxDQUFDLE1BQU07RUFDbkI7RUFDQUQsTUFBTSxDQUFDRSxPQUFPLENBQUMsT0FBTyxFQUFFLFlBQVc7SUFDakMsT0FBT1AsS0FBSyxDQUFDUSxJQUFJLENBQUMsQ0FBRSxDQUFDLENBQUM7RUFDeEIsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBRUZILE1BQU0sQ0FBQ0ksT0FBTyxDQUFDO0VBQ2JDLE9BQU8sRUFBR0MsSUFBSSxJQUFLO0lBQ2pCWCxLQUFLLENBQUNZLE1BQU0sQ0FBQztNQUFFRCxJQUFJO01BQUVFLFNBQVMsRUFBRSxJQUFJQyxJQUFJO0lBQUcsQ0FBQyxDQUFDO0VBQy9DLENBQUM7RUFDREMsVUFBVSxFQUFHQyxHQUFHLElBQUs7SUFDbkJoQixLQUFLLENBQUNpQixNQUFNLENBQUM7TUFBRUQ7SUFBSSxDQUFDLENBQUM7RUFDdkI7QUFDRixDQUFDLENBQUMsQyIsImZpbGUiOiIvYXBwLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTW9uZ28gfSBmcm9tICdtZXRlb3IvbW9uZ28nO1xuXG5leHBvcnQgY29uc3QgVGFza3MgPSBuZXcgTW9uZ28uQ29sbGVjdGlvbihcInRhc2tzXCIpOyIsImltcG9ydCB7IE1ldGVvciB9IGZyb20gJ21ldGVvci9tZXRlb3InO1xuaW1wb3J0IHsgVGFza3MgfSBmcm9tICcuLi9saWIvY29sbGVjdGlvbi5qcyc7XG5cbk1ldGVvci5zdGFydHVwKCgpID0+IHtcbiAgLy8gY29kZSB0byBydW4gb24gc2VydmVyIGF0IHN0YXJ0dXBcbiAgTWV0ZW9yLnB1Ymxpc2goJ3Rhc2tzJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIFRhc2tzLmZpbmQoeyB9KTtcbiAgfSlcbn0pO1xuXG5NZXRlb3IubWV0aG9kcyh7XG4gIGFkZFRhc2s6IChuYW1lKSA9PiB7XG4gICAgVGFza3MuaW5zZXJ0KHsgbmFtZSwgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpIH0pXG4gIH0sXG4gIGRlbGV0ZVRhc2s6IChfaWQpID0+IHtcbiAgICBUYXNrcy5yZW1vdmUoeyBfaWQgfSlcbiAgfVxufSkiXX0=
