const session=require("express-session");
const  MongoDBStore = require('connect-mongodb-session')(session);
const mongoose = require('mongoose');
const uri = "mongodb+srv://satyammishra2:satyammishra@cluster0.p71lj.mongodb.net/Calendardemo2?retryWrites=true&w=majority";
// const uri = "mongodb://localhost:27017/Calendaraaa"
mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log("MongoDB Connected…")
})
.catch(err => console.log(err))
// INITIALIZING MONGOSTORE
const myMongoStore = new MongoDBStore({
    uri: "mongodb+srv://satyammishra2:satyammishra@cluster0.p71lj.mongodb.net/Calendardemo2?retryWrites=true&w=majority",
    collection: 'mySessions'
});

module.exports = {myMongoStore}
