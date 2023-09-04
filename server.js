//jshint esversion:6
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const findOrCreate = require('mongoose-findorcreate');
const axios = require('axios');
const app = express();
const apikey= process.env.APIKEY; 
var path = require('path');
const cors = require('cors');

let book , currentUser , isAdmin = false , warning = "Enter Email";
const MONGO_URL = process.env.MONGO_URL;

app.use(
  cors({
    origin: 'http://localhost:3000', // replace with your frontend's origin
    methods: ['GET', 'POST'], // specify the allowed HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // specify the allowed headers
  })
);

app.use(express.static(path.resolve('./public')));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.json());

app.use(session({
  secret: "Our little secret.",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// console.log(Book);
mongoose.set('strictQuery', true);
// Increase the timeout to 20 seconds (default is 10 seconds)
mongoose.set('findOneAndModify', false); // Disable findOneAndUpdate and findOneAndDelete options
mongoose.set('findOneAndModify', false); // Disable findOneAndUpdate and findOneAndDelete options
mongoose.set('findOneAndRemove', false); // Disable findOneAndRemove option
mongoose.set('bufferTimeoutMS', 20000); // Set the buffer timeout to 20 seconds

mongoose.connect(MONGO_URL,{
  useNewUrlParser : true , 
  useUnifiedTopology:true
},(err)=>{
   if(err){
    console.log(err);
   } else{
    console.log("db connected");
   }
}) ;

//mongoose.set("useCreateIndex", true);

const userSchema = new mongoose.Schema ({
  email: String,
  password: String,
  googleId: String,
  Book : [],
  facebookId:String
});

const cartSchema = new mongoose.Schema({
  username : String,
  displayname : String ,
  Books : {
    userBookIds :[] ,
    userBookTitles :[],
    userBookAuthors : []
  } 
})

const querySchema = mongoose.Schema({
  name : String,
  username : String ,
  time : String,
  message : String
})



userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);
const Cart = mongoose.model("Cart",cartSchema);
const Query = new mongoose.model("Query",querySchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "https://rsjlmsnode.onrender.com/auth/google/oauth",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    const newCartUser = new Cart({
      username : profile.emails[0].value ,
      displayname : profile.displayName ,
      Books : []
    });
    console.log(profile);
    Cart.find({},function(err,foundUsers){
      if(err){
        console.log(err);
      }else{
        if(newCartUser.username === "ebooksite210701278@gmail.com"){
          isAdmin = true ;
          console.log("admin logged");
        }
        let flag = 0 ;
        for(var i = 0 ; i < foundUsers.length ; i++){
          if(foundUsers[i].username === newCartUser.username ){
            flag++;
            console.log("user already found");
          }
        }
        if(flag === 0){
          newCartUser.save((err,data)=>{
            if(err){
              console.log(err);
            }else{
              console.log(data);
            }
          });
        }
      }
    })
   
    
    currentUser = profile.emails[0].value;
    console.log(profile);

    User.findOrCreate({  username: profile.emails[0].value,googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

passport.use(new FacebookStrategy({
  clientID: process.env.CLIENT_ID_FB,
  clientSecret: process.env.CLIENT_SECRET_FB,
  callbackURL: "https://rsjlmsnode.onrender.com/auth/facebook/secrets"
},
function(accessToken, refreshToken, profile, cb) {
  
  User.findOrCreate({ facebookId: profile.id }, function (err, user) {
    return cb(err, user);
  });
}
));

app.get("/", function(req, res){
  res.render("home");
});

app.get("/auth/google",
passport.authenticate('google', { scope: ['profile',"email"] }));


app.get("/auth/google/oauth",
  passport.authenticate('google', { failureRedirect: "/login" }),
  function(req, res) {
    // Successful authentication, redirect to secrets.
    res.redirect("/secrets");
  });

  app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/secrets',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/secrets');
  });
app.get("/login", function(req, res){
  res.render("login");
});

app.get("/register", function(req, res){
  res.render("register");
});

app.get("/secrets", function(req, res){
  User.find({"secret": {$ne: null}}, function(err, foundUsers){
    if (err){
      console.log(err);
    } else {
      if (foundUsers) {
        console.log("user is " + foundUsers);
        res.render("secrets", {usersWithSecrets: foundUsers, currentUser : currentUser});
      }
    }
  });
});

app.get("/submit", function(req, res){
  if (req.isAuthenticated()){
    res.render("submit");
  } else {
    res.redirect("/login");
  }
});

app.post("/submit", function(req, res){
  const submittedSecret = req.body.secret;


  User.findById(req.user.id, function(err, foundUser){
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        foundUser.secret = submittedSecret;
        foundUser.save(function(){
          res.redirect("/secrets");
        });
      }
    }
  });
});

app.get('/logout', function(req, res, next) {
    req.logout(function(err) {
      isAdmin = false ;
      if (err) { return next(err); }
      res.redirect('/');
    });
  });

app.post("/register", function(req, res){

  User.register({username: req.body.username}, req.body.password, function(err, user){
    if (err) {
      console.log(err);
      res.redirect("/register");
    } else {
      passport.authenticate("local")(req, res, function(){
        res.redirect("/secrets");
      });
    }
  });

});

// app.get("/admin",(req,res)=>{
//   if(isAdmin){
//     Query.find({},(err,data)=>{
//       if(err){
//         console.log(err);
//       }else{
//         console.log(data);
//       }
//       res.render("admin",{queryList : data });
//     })
//   } else{
//     res.redirect("/error");
//   }
// })

app.get("/admin", (req, res) => {
  Query.find({}, (err, data) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "An error occurred" });
    } else {
      console.log(data);
      res.status(200).json(data);
    }
  });
});


app.post("/login", function(req, res){

  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, function(err){
    if (err) {
      console.log(err);
    } else {
      passport.authenticate("local")(req, res, function(){
        res.redirect("/secrets");
      });
    }
  });

});


app.get("/book",function(req,res){
  res.render("book");
})

app.get("/author",(req,res)=>{
  res.render("book");
})
app.get("/genre",(req,res)=>{
  res.render("book");
})
app.post("/book", function(req,res){
  // console.log(req.body.book);
  book = req.body.book ;
const Book = async () => {
  try{
    return await axios.get("https://www.googleapis.com/books/v1/volumes?q="+book+":keyes&key="+apikey+"&maxResults=40")
  } catch(err){
    console.error(err);
  }
}

const Books = async () =>{
  const books = await Book();
  if(books){
    if(books.data.items === undefined ){
      console.log("error");
      res.redirect("/error");
    }else{
      for( var i = 0 ; i < 39 ; i++ ){
      var author = books.data.items[i].volumeInfo.authors === undefined ? "" : books.data.items[i].volumeInfo.authors ;
      }
      console.log(books.data.items);
      res.render("bookShow", {renderedBooks : books.data , authors : author  , currentUser : currentUser})
      }
  }
}

Books();
})



app.post("/author", function(req,res){
  console.log(req.body.author);
  var author = req.body.author ;
const Author = async () => {
  try{
    return await axios.get("https://www.googleapis.com/books/v1/volumes?q=inauthor:%22"+author+":%22&key="+apikey+"&maxResults=40")
    //Richard+MorenoAIzaSyAr6yx8VDgYt4v2REyUur6ZC-fHKaRqDyo
  } catch(err){
    console.error(err);
  }
}

const Authors = async () =>{
  const authors = await Author();
  if(authors){
    for( var i = 0 ; i < 39 ; i++ ){
      var author = authors.data.items[i].volumeInfo.authors === undefined ? "" : authors.data.items[i].volumeInfo.authors ;
      }
    console.log(authors.data);
    res.render("bookShow", {renderedBooks : authors.data ,  authors : author })
  }else{
    res.redirect("/error");
  }
}

Authors();
})

app.get("/cart/:user", function(req,res){
  console.log("param found is " + req.params.user);
 try{
  Cart.find({username : currentUser },function(err,currentUserFound){
    if(err){
      console.log(err);
      res.status(200).json({error : "no books found"})
    } else {
      console.log(currentUserFound);
      
     res.render("cart",{ cartDetails : currentUserFound });
    //  res.status(400).json(currentUserFound)
    }
  })
 }catch(err){
  res.redirect("/error");
 }
})


app.get("/contact", function(req,res){
  res.render("contact",{message : warning });
})

app.get("/remove",(req,res)=>{
  res.redirect("/cart");
})

app.get("/error",(req,res)=>{
  res.render("error");
})

app.post("/cart/:user",function(req,res){
  console.log(currentUser);
  User.find({username : currentUser },function(err,currentUserFound){
    if(err){
      console.log(err);
    } else {
      Cart.updateOne({ "username": currentUser},
        { "$push": { "Books.userBookIds": req.body.addedBookId ,  "Books.userBookTitles" : req.body.addedBookTitle ,
        "Books.userBookAuthors" : req.body.addedBookAuthor } },
        function (err, raw) {
            if (err) return handleError(err);
            console.log('The raw response from Mongo was ', raw);
        }
     );
     Cart.find({},function(err,foundUsers){
      console.log(foundUsers);
     })
    }
  })
  console.log("added");
  res.redirect("/cart/"+currentUser);
})


app.post("/remove",(req,res)=>{
  console.log(req.body);
  Cart.updateOne({username : currentUser},
    {"$pull" : {"Books.userBookIds" : req.body.removedBookId , "Books.userBookTitles" : req.body.removedBookTitle ,"Books.userBookAuthors" : req.body.removedBookAuthor } }
    ,function(err,raw){
    if(err){
      console.log(err);
    }else{
      console.log(raw);
      res.redirect("/cart/`{$currentUser}`");
    }
  })
})

app.post("/contact",function(req,res){
  console.log(req.body);
  var date = new Date();
  if(req.body.email !== currentUser){
    console.log("please enter your mail");
    warning = "please enter your mail" ;
    res.redirect("/contact");
  }else{
  const newMessage = new Query({
    name : req.body.name ,
    username : req.body.email,
    time : date.toLocaleTimeString()+" "+date.toLocaleDateString(),
    message : req.body.message
  });
  newMessage.save();
  res.redirect("/secrets")
}
})

app.listen( process.env.PORT || 5000, function() {
  console.log("Server started on port "+ (process.env.PORT || 5000) );
});


app.post("/example",(req,res)=>{
  console.log(req);
  res.status(400).json({message : "ok"})
})