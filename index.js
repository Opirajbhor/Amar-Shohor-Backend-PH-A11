import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { client } from "./mongoClient.js";
import { initializeApp } from "firebase-admin/app";
import { ObjectId } from "mongodb";
import Stripe from "stripe";
import admin from "firebase-admin";
import serverless from "serverless-http";

dotenv.config();

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

// firebase admin sdk
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const port = process.env.PORT || 3000;
const app = express();
const stripe = new Stripe(process.env.STRIPE_KEY);

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
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next();
  } catch (err) {
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
    const paymentCollection = db.collection("payments");

    // GET data starts---------------------------
    // user role---------
    app.get("/user/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await users.findOne(query);
      res.send(result?.role || "Citizen");
    });

    // all issues get
    app.get("/all-issues", async (req, res) => {
      try {
        const result = await all_Issues.find().toArray();
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ mesage: "data load failled" });
      }
    });
    // get latest issuess-------------
    app.get("/latest-issues", async (req, res) => {
      try {
        const result = await all_Issues
          .find()
          .sort({ _id: -1 })
          .limit(6)
          .toArray();
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ mesage: "data load failled" });
      }
    });

    // get user issue Data-------------
    app.get("/user-issues", verifyJWT, async (req, res) => {
      const userEmail = req.headers.email;
      if (!userEmail) {
        return res.status(400).json({ message: "user is missing." });
      }
      try {
        const query = { reportedBy: userEmail };
        // Debug here:
        const issues = await all_Issues.find(query).toArray();
        res.status(200).json(issues);
      } catch (err) {
        res.status(500).send({ message: "Server Error", error: err.message });
      }
    });

    // get single issue data
    app.get("/all-issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await all_Issues.findOne(query);
      res.send(result);
    });

    // get user payments
    app.get("/user-payments", verifyJWT, async (req, res) => {
      const userEmail = req.headers.email;
      if (!userEmail) {
        return res.status(400).json({ message: "user is missing." });
      }
      try {
        const query = { email: userEmail };
        const issues = await paymentCollection.find(query).toArray();
        res.status(200).json(issues);
      } catch (err) {
        res.status(500).send({ message: "Server Error", error: err.message });
      }
    });

    // Admin----------------
    // manage issues------------
    app.get("/manage-issues", verifyJWT, async (req, res) => {
      try {
        const result = await all_Issues.find().toArray();
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ mesage: "data load failled" });
      }
    });
    // manage users----------------
    app.get("/manage-users", verifyJWT, async (req, res) => {
      try {
        const result = await users.find({ role: "Citizen" }).toArray();
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ mesage: "data load failled" });
      }
    });
    // manage staff----------------
    app.get("/manage-staff", verifyJWT, async (req, res) => {
      try {
        const result = await users.find({ role: "Staff" }).toArray();
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ mesage: "data load failled" });
      }
    });
    // staff list----------------
    app.get("/staff-list", verifyJWT, async (req, res) => {
      try {
        const result = await users.find({ role: "Staff" }).toArray();
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ mesage: "data load failled" });
      }
    });
    // manage payments----------------
    app.get("/manage-payments", verifyJWT, async (req, res) => {
      try {
        const result = await paymentCollection.find().toArray();
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ mesage: "data load failled" });
      }
    });

    // staff issues----------------
    app.get("/assign-issues", verifyJWT, async (req, res) => {
      const { name } = req.query;
      if (!name) {
        return res.status(400).json({ message: "user is missing." });
      }
      try {
        const result = await all_Issues
          .find({ assignedTo: "Opi Rajbhor" })
          .toArray();
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ mesage: "data load failled" });
      }
    });
    // Get data ends--------------------------------------

    // ***********Post Data starts-------------------------------------

    // post an issue
    app.post("/all-issues", verifyJWT, async (req, res) => {
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
          isBoosted: false,
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
    // user create-----------------
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
    // staff create-----------------
    // post user info from registration form method
    app.post("/staff", verifyJWT, async (req, res) => {
      try {
        const { name, imageURL, email, phone } = req.body;
        const isUserAvailable = await users.countDocuments({ email: email });
        if (isUserAvailable) {
          return res.send("staff data already available in db");
        } else {
          const data = {
            name,
            email,
            phone,
            role: "Staff",
            photoURL: imageURL,
            createdAt: new Date(),
          };
          const result = await users.insertOne(data);
          res.send("staff added to db");
        }
      } catch (err) {
        res.send("data send failled to db", result);
      }
    });

    // google user info-----------
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
    // payment api for boost issue------------
    app.post("/create-checkout-session", verifyJWT, async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "BDT",
              unit_amount: 100000,
              product_data: {
                name: paymentInfo.title,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.email,
        mode: "payment",
        metadata: {
          issueId: paymentInfo.issueId,
          issueTitle: paymentInfo.title,
        },
        success_url: `${process.env.CLIENT_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/dashboard/payment-cancel`,
      });
      res.json({ url: session.url });
    });
    // Post Data ends---------------------------------------

    // patch Data Starts-------------------------
    app.patch("/all-issues/:id", verifyJWT, async (req, res) => {
      try {
        const { id } = req.params;
        const updates = req.body;

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
    // patch Data Starts-------------------------
    app.patch("/manage-users/:id", verifyJWT, async (req, res) => {
      try {
        const { id } = req.params;
        const blockState = req.body;

        const result = await users.updateOne(
          { _id: new ObjectId(id) },
          { $set: blockState }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Issue not found" });
        }

        res.send({ success: true });
      } catch (error) {
        res.status(400).send({ message: "Update failed" });
      }
    });

    // update profile--------
    app.patch("/profile-update", verifyJWT, async (req, res) => {
      const { name, photoURL } = req.body;
      const email = req.tokenEmail;
      const update = {
        $set: { name, photoURL },
      };
      const result = await users.updateOne({ email }, update);
      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send({
        success: true,
        message: "Profile updated successfully",
      });
    });

    // payment data update
    app.patch("/payment-success", verifyJWT, async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const isPaymentExist = await paymentCollection.findOne(query);
      if (isPaymentExist) {
        return res.send({
          message: "already exist",
          transactionId: transactionId,
        });
      }

      if (session?.payment_status === "paid") {
        const paidIssueId = session?.metadata.issueId;
        const query = { _id: new ObjectId(paidIssueId) };
        const update = {
          $set: {
            isBoosted: true,
          },
        };
        const result = await all_Issues.updateOne(query, update);

        const payment = {
          amount: 1000,
          currency: session.currency,
          email: session.customer_email,
          title: session.metadata.issueTitle,
          id: session.metadata.issueId,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
        };

        if (session?.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(payment);
          res.send({
            success: true,
            modifyIssue: result,
            paymentInfo: resultPayment,
            transactionId: session.payment_intent,
          });
        }
      }
      res.send({ success: false });
    });
    // patch Data ends-------------------------

    // Delete Data Starts------------------
    app.delete("/all-issues/:id", verifyJWT, async (req, res) => {
      const issueId = req.params.id;
      const doc = await all_Issues.findOne();
      const query = { _id: new ObjectId(issueId) };
      const result = await all_Issues.deleteOne(query);
      res.status(200).send({ message: "Issue deleted" });
    });
    app.delete("/staff-delete/:id", verifyJWT, async (req, res) => {
      const staffId = req.params.id;
      const query = await users.findOne({ _id: new ObjectId(staffId) });
      const result = await users.deleteOne(query);
      res.status(200).send({ message: "Staff deleted" });
    });

    // Delete Data ends------------------
  } catch (error) {
    process.exit(1); 
  } finally {
    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  }
}
connectDB().catch(console.dir);
// Routes
app.get("/", (req, res) => {
  res.send("Backend is Running PERFECTLY!");
});
