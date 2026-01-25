import express from "express";
import bodyParser from "body-parser";

import pg from "pg";

import AES from "crypto-js/aes.js";
import Utf8 from "crypto-js/enc-utf8.js";
import bcrypt, { hash } from "bcrypt";

import session from "express-session";
import passport from "passport";

import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import env from "dotenv";

const saltRounds = 14;

const app = express();
const port = 3000;
env.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const db = new pg.Client({
  user:process.env.PG_USER,
  host:process.env.PG_HOST,
  database:process.env.PG_DATABASE,
  password:process.env.PG_PASSWORD,
  port:process.env.PG_PORT,
});

db.connect()

app.use(
  session({
    secret: process.env.SESSION_COOKIE_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 6 },
  })
);

app.use(passport.initialize());
app.use(passport.session());

function encrypt(text, password) {
  return AES.encrypt(text, password).toString();
}

function decrypt(ciphertext, password) {
  const bytes = AES.decrypt(ciphertext, password);
  return bytes.toString(Utf8);
}

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/main", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("main.ejs");
  } else {
    res.redirect("/login");
  }
});

app.get("/auth/google",passport.authenticate("google",{
  scope:["profile","email"],

}));

app.get(
  "/auth/google/main",
  passport.authenticate("google", {
    successRedirect: "/main",
    failureRedirect: "/login",
  })
);

app.get("/logout",(req,res)=>{
  req.logout((err)=>{
  if (err) console.log(err);
  res.redirect("/");
});
})

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/main",
    failureRedirect: "/login",
  })
);

app.post("/register", async (req, res) => {

  const password = req.body.password;
  
  if (req.body.username.length == 0 || req.body.password.length==0) {
      res.send("<h1>Email / password not valid</h1>");
  } else {
  
    try {
  
      if ((await db.query("SELECT * FROM users where email = $1;",[req.body.username])).rows.length >0){
        res.send("<h1>Email already exists</h1>");

      } else {
          bcrypt.hash(password,saltRounds, async (err,hash)=>{
            if (err){
              console.log("error in hashing",err);
            } else {
  
              const result = await db.query("INSERT INTO users(email,password) VALUES ($1,$2) RETURNING *",[
                req.body.username,
                encrypt(hash,process.env.HASHING_SECRET)]
              );
              const user = result.rows[0];
              req.login(user,(err)=>{
                console.log("sucess");
                res.redirect("/main");
              });  
            }
            }
          );        
        }
      } catch (err) {
        console.log(err);
    } 
  }
});

passport.use("local",new Strategy( async function verify(username,password,cb){
  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [username,]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const storedPassword = decrypt(user.password,process.env.HASHING_SECRET);

      bcrypt.compare(password,storedPassword,(err,result)=>{
        if (err){
          console.log("error in camparing",err);
          return cb(err);
        } else {
          if (result){
            return cb(null,user);
          } else {
            return cb(null,false);
          }
        }
      });
      
    } else {
      return cb("user not found");
    }
  } catch (err) {
    console.log(err);
    return cb(err);
  }
}
)
);

passport.use(
  "google",
  new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/main",
    userProfileURL : "https://www.googleapis.com/oauth2/v3/userinfo",
  },async (accessToken,refreshToken,profile,cb)=>{
    console.log(profile);
    try{
      const result = await db.query("SELECT * FROM users WHERE email = $1",[profile.email]);
      if (result.rows.length === 0){
        const NewUser = await db.query("INSERT INTO users (email,password) VALUES ($1,$2);",[profile.email,"google"]);
        cb(null,NewUser.rows[0]);
      } else {
        cb(null,result.rows[0]);
      }

    } catch (err){
      cb(err);

    }
  })
);

passport.serializeUser((user,cb)=>{
  cb(null,user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
