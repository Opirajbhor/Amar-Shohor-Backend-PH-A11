import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { client } from "./mongoClient.js";
import { initializeApp } from "firebase-admin/app";
import { ObjectId } from "mongodb";
import Stripe from 'stripe';

import admin from "firebase-admin";
import serviceAccount from "./AmarShohor-firebaseAdminSDK.json" with { type: 'json' };

// firebase admin sdk
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

dotenv.config();
const port = process.env.PORT || 3000;
const app = express();

const stripe = new Stripe(process.env.STRIPE_KEY);

console.log("CLIENT_URL:", process.env.CLIENT_URL);

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());

// JWT verication
// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    console.log(decoded);
    console.log("token email--->", req.tokenEmail);
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

// MongoDB connection
async function connectDB() {
  try {
    await client.connect();
    const db = client.db("AmarShohor");
    const all_Issues = db.collection("All_issues");
    const timeline = db.collection("timeline");
    const users = db.collection("users");

    // GET data starts---------------------------
    // all issues get
    app.get("/all-issues", async (req, res) => {
      try {
        const result = await all_Issues.find().toArray();
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ mesage: "data load failled" });
      }
    });

    // get user issue Data-------------
    app.get("/user-issues", async (req, res) => {
      const userEmail = req.headers.email
      if (!userEmail) {
        return res.status(400).json({ message: "user is missing." });
          }
          try {
        const query = {reportedBy:userEmail}
              // Debug here:
        const issues = await all_Issues.find(query).toArray();
        res.status(200).json(issues);
      } catch (err) {
        console.error("SERVER ERROR:", err);
        res.status(500).send({ message: "Server Error", error: err.message });
      }
    });

    // get single issue data
    app.get('/all-issues/:id', async(req, res)=>{
    const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await all_Issues.findOne(query)
      res.send(result)
    })

    // Get data ends--------------------------------------

    // Post Data starts-------------------------------------
    // post an issue
    app.post("/all-issues", async (req, res) => {
      const { title, description, email, location, category, image } = req.body;

      const userLimit = all_Issues.countDocuments({ reportedBy: email });
      if (userLimit.length >= 3) {
        return res.status(403).json({
          message:
            "Free user limit reached. Please subscribe to Premium to post more issues.",
        });
      }
      try {
        const newIssue = {
          title,
          description,
          location,
          category,
          image,
          reportedBy: email,
          status: "Pending",
          createdAt: new Date(),
          upvoteCount: 0,
          assignedTo: "Not Assigned Yet",
        };
        const result = await all_Issues.insertOne(newIssue);

        // Timeline entry---------------
        // insertedid
        const insertedID = result.insertedId;

        const timelineData = {
          issueId: insertedID,
          status: "Pending",
          message: "Issue successfully reported by Citizen.",
          updatedByRole: "Citizen",
          updatedByEmail: email,
          dateAndTime: new Date(),
        };
        await timeline.insertOne(timelineData);

        res.status(201).json(result);
      } catch (err) {
        res
          .status(500)
          .json({ message: "failled to report issue", error: err.message });
      }
    });
    // -----------------
    // post user info from registration form method
    app.post("/user", async (req, res) => {
      try {
        const { name, imageURL, email } = req.body;
        const isUserAvailable = await users.countDocuments({ email: email });
        if (isUserAvailable) {
          return res.send("user data already available in db");
        } else {
          const data = {
            name,
            email,
            role: "Citizen",
            photoURL: imageURL,
            isPremium: false,
            isBlocked: false,
            createdAt: new Date(),
          };
          const result = await users.insertOne(data);
          res.send("user added to db");
        }
      } catch (err) {
        res.send("data send failled to db", result);
      }
    });

    // google user info
    app.post("/google-users", async (req, res) => {
      try {
        const { name, imageURL, email } = req.body;
        const isUserAvailable = await users.countDocuments({ email: email });
        if (isUserAvailable) {
          return res.send("user data already available in db");
        } else {
          const data = {
            name,
            email,
            role: "Citizen",
            photoURL: imageURL,
            isPremium: false,
            isBlocked: false,
            createdAt: new Date(),
          };
          const result = await users.insertOne(data);
          res.send("user added to db");
        }
      } catch (err) {
        res.send("data send failled to db", result);
      }
    });
// payment api
app.post('/create-checkout-session', async (req, res) => {
    const paymentInfo =  req.body
    const session = await stripe.checkout.sessions.create({
         line_items: [
      {
        // Provide the exact Price ID (for example, price_1234) of the product you want to sell
        price_data: {
          currency : 'BDT',
          unit_amount: 100000,
          product_data: {
            name: paymentInfo.title,
          },

        },
        quantity: 1,
      },
    ],
    customer_email: paymentInfo.email,
    mode: 'payment',
    meta_data: {
      issueId:paymentInfo._id,

    },
    success_url: `${process.env.CLIENT_URL}/dashboard/payment-success`,
    cancel_url: `${process.env.CLIENT_URL}/dashboard/payment-cancel`,
    })
    console.log(session)
    res.json({url: session.url})
    
})



    // Post Data ends---------------------------------------
    // patch Data Starts-------------------------

    app.patch("/all-issues/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    console.log("upates", updates)

    const result = await all_Issues.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Issue not found" });
    }

    res.send({ success: true });
  } catch (error) {
    res.status(400).send({ message: "Update failed" });
  }
});


    // patch Data ends-------------------------

    // Delete Data Starts------------------
  app.delete('/all-issues/:id', async (req, res)=>{
    const issueId = req.params.id
    console.log(issueId)
    const doc = await all_Issues.findOne();
console.log("sample doc:", doc);
    const query = {_id: new ObjectId(issueId)}
    const result =   await all_Issues.deleteOne(query)
    console.log("deleted result",result)
    res.status(200).send({message: "Issue deleted"})
  })

    // Delete Data ends------------------



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
