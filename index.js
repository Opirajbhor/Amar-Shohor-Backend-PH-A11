import express from "express";
// import mongoose from "mongoose";
import cors from "cors";
// import serverless from "serverless-http";
// import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import dotenv from "dotenv";
import sampleData from "./data/sample.json" with  { type: "json" };

dotenv.config();
const port = process.env.PORT || 3000;
const app = express();

// middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is Running!");
});
app.get("/users", (req, res) => {
  res.send(sampleData);
});

app.listen(port, () => {
  console.log("Server running on port", port);
});
