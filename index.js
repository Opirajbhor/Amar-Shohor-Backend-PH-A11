import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import sampleData from "./data/sample.json" with { type: "json" };
import { client } from "./mongoClient.js";

dotenv.config();
const port = process.env.PORT || 3000;
const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());

// MongoDB connection
async function connectDB() {
  try {
    await client.connect();
   const db = client.db('AmarShohor')
   const all_Issues = db.collection("All_issues")
   const users = db.collection("users")

// GET data starts---------------------------
// all issues get
app.get("/all-issues", async (req, res) => {
  try{
    const result = await all_Issues.find().toArray()
      res.status(200).json(result)
    
  }
  catch(err){
    res.status(500).json({error:"data load failled"})

  }
});
// Get data ends--------------------------------------

// Post Data starts-------------------------------------
// post an issue
app.post('/all-issues', async (req, res)=>{
  try{
    const data = await req.body
    const result = await all_Issues.insertOne(data)
    res.send(result)
  }
  catch(err){
    res.send("data send failled to db", result)
  }
})
// -----------------
// post user info
app.post('/user', async (req, res)=>{
  try{
    const data = await req.body
    const result = await users.insertOne(data)
    res.send(result)
  }
  catch(err){
    res.send("data send failled to db", result)
  }
})

// Post Data ends---------------------------------------




  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1); // stop server if DB connection fails
  }
}

// Routes
app.get("/", (req, res) => {
  res.send("Backend is Running!");
});





// Start server only after DB connects
connectDB().then(() => {
  app.listen(port, () => {
    console.log("Server running on port", port);
  });
});
