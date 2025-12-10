import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import sampleData from "./data/sample.json" with { type: "json" };
import { client } from "./mongoClient.js";

dotenv.config();
const port = process.env.PORT || 3000;
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
async function connectDB() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB connected successfully.");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1); // stop server if DB connection fails
  }
}

// Routes
app.get("/", (req, res) => {
  res.send("Backend is Running!");
});

app.get("/users", (req, res) => {
  res.send(sampleData);
});

// Optional: MongoDB example route
app.get("/mongo-users", async (req, res) => {
  try {
    const users = await client.db("testdb").collection("users").find().toArray();
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Start server only after DB connects
connectDB().then(() => {
  app.listen(port, () => {
    console.log("Server running on port", port);
  });
});
