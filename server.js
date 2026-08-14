// server.js
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var require_db = __commonJS({
  "config/db.js"(exports2, module2) {
    var mongoose = require("mongoose");
    async function connectDB2() {
      let uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ci360";
      uri = uri.trim();
      if (uri.startsWith("mongodb:mongodb+srv://")) {
        uri = uri.replace("mongodb:mongodb+srv://", "mongodb+srv://");
      }
      try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5e3 });
        console.log("\u2705 MongoDB connected successfully:", mongoose.connection.host);
      } catch (err) {
        console.error("\u274C MongoDB Connection Error:", err.message);
        console.error("--------------------------------------------------");
        console.error("Please check your MONGO_URI in backend/.env file:");
        console.error("1. Verify your MongoDB username & password in MONGO_URI.");
        console.error("2. Make sure your IP address (0.0.0.0/0) is whitelisted in MongoDB Atlas Network Access.");
        console.error("3. If using local MongoDB, ensure the service is running on 127.0.0.1:27017.");
        console.error("--------------------------------------------------");
      }
    }
    module2.exports = connectDB2;
  }
});
var require_User = __commonJS({
  "models/User.js"(exports2, module2) {
    var mongoose = require("mongoose");
    var UserSchema = new mongoose.Schema({
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true },
      role: { type: String, enum: ["superadmin", "employee", "client"], required: true },
      // Link an employee login to their Personnel record
      personnelId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel", default: null },
      // Link a client login to their Client record
      clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },
      active: { type: Boolean, default: true }
    }, { timestamps: true });
    module2.exports = mongoose.model("User", UserSchema);
  }
});
var require_auth = __commonJS({
  "middleware/auth.js"(exports2, module2) {
    var jwt = require("jsonwebtoken");
    var User = require_User();
    async function verifyToken(req, res, next) {
      try {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: "No token provided" });
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(payload.id);
        if (!user || !user.active) return res.status(401).json({ error: "Invalid or inactive account" });
        req.user = user;
        next();
      } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
    }
    function requireRole(...roles) {
      return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
          return res.status(403).json({ error: "You do not have permission to do that" });
        }
        next();
      };
    }
    module2.exports = { verifyToken, requireRole };
  }
});
var require_auth2 = __commonJS({
  "routes/auth.js"(exports2, module2) {
    var express2 = require("express");
    var mongoose = require("mongoose");
    var bcrypt = require("bcryptjs");
    var jwt = require("jsonwebtoken");
    var User = require_User();
    var { verifyToken } = require_auth();
    var router = express2.Router();
    function signToken(user) {
      return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "12h" });
    }
    function publicUser(user) {
      return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        personnelId: user.personnelId,
        clientId: user.clientId
      };
    }
    router.post("/login", async (req, res) => {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
          error: "Database connection failed. Please check your MONGO_URI in backend/.env (verify username, password, and IP whitelist in MongoDB Atlas)."
        });
      }
      try {
        const { email, username, identifier, password } = req.body;
        const inputStr = (email || username || identifier || "").trim();
        if (!inputStr || !password) {
          return res.status(400).json({ error: "Username/Email and password are required" });
        }
        const lowerInput = inputStr.toLowerCase();
        const slugInput = lowerInput.replace(/[^a-z0-9]/g, "");
        const user = await User.findOne({
          $or: [
            { email: lowerInput },
            { email: `${slugInput}@ci360.local` },
            { name: new RegExp(`^${inputStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
          ]
        });
        if (!user || !user.active) {
          return res.status(401).json({ error: "Invalid username/email or password" });
        }
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
          return res.status(401).json({ error: "Invalid username/email or password" });
        }
        const token = signToken(user);
        res.json({ token, user: publicUser(user) });
      } catch (err) {
        res.status(500).json({ error: "Login failed", detail: err.message });
      }
    });
    router.get("/me", verifyToken, async (req, res) => {
      res.json({ user: publicUser(req.user) });
    });
    module2.exports = router;
  }
});
var require_users = __commonJS({
  "routes/users.js"(exports2, module2) {
    var express2 = require("express");
    var bcrypt = require("bcryptjs");
    var User = require_User();
    var { verifyToken, requireRole } = require_auth();
    var router = express2.Router();
    router.use(verifyToken, requireRole("superadmin"));
    router.get("/", async (req, res) => {
      const users = await User.find().select("-passwordHash").populate("personnelId", "name").populate("clientId", "name").sort("name");
      res.json(users);
    });
    router.post("/", async (req, res) => {
      try {
        const { name, email, password, role, personnelId, clientId } = req.body;
        if (!name || !email || !password || !role) return res.status(400).json({ error: "name, email, password and role are required" });
        if (!["superadmin", "employee", "client"].includes(role)) return res.status(400).json({ error: "Invalid role" });
        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) return res.status(400).json({ error: "A user with that email already exists" });
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
          name,
          email: email.toLowerCase().trim(),
          passwordHash,
          role,
          personnelId: role === "employee" ? personnelId || null : null,
          clientId: role === "client" ? clientId || null : null
        });
        const clean = user.toObject();
        delete clean.passwordHash;
        res.status(201).json(clean);
      } catch (err) {
        res.status(500).json({ error: "Could not create user", detail: err.message });
      }
    });
    router.put("/:id", async (req, res) => {
      try {
        const { name, email, password, role, personnelId, clientId, active } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });
        if (name != null) user.name = name;
        if (email != null) user.email = email.toLowerCase().trim();
        if (role != null) user.role = role;
        if (personnelId !== void 0) user.personnelId = role === "employee" || user.role === "employee" ? personnelId : null;
        if (clientId !== void 0) user.clientId = role === "client" || user.role === "client" ? clientId : null;
        if (active != null) user.active = active;
        if (password) user.passwordHash = await bcrypt.hash(password, 10);
        await user.save();
        const clean = user.toObject();
        delete clean.passwordHash;
        res.json(clean);
      } catch (err) {
        res.status(500).json({ error: "Could not update user", detail: err.message });
      }
    });
    router.delete("/:id", async (req, res) => {
      await User.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    });
    module2.exports = router;
  }
});
var require_Personnel = __commonJS({
  "models/Personnel.js"(exports2, module2) {
    var mongoose = require("mongoose");
    var PersonnelSchema = new mongoose.Schema({
      name: { type: String, required: true, trim: true },
      duties: { type: String, default: "" },
      capacity: { type: Number, default: 48 },
      // weekly hours, 6-day work week
      status: { type: String, enum: ["active", "work from home", "wfh", "on leave", "pn leave"], default: "active" }
    }, { timestamps: true });
    module2.exports = mongoose.model("Personnel", PersonnelSchema);
  }
});
var require_personnel = __commonJS({
  "routes/personnel.js"(exports2, module2) {
    var express2 = require("express");
    var Personnel = require_Personnel();
    var { verifyToken, requireRole } = require_auth();
    var router = express2.Router();
    router.use(verifyToken);
    router.get("/", async (req, res) => {
      const list = await Personnel.find().sort("name");
      res.json(list);
    });
    router.post("/", requireRole("superadmin"), async (req, res) => {
      const { name, duties, capacity, status } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const p = await Personnel.create({ name, duties, capacity, status });
      res.status(201).json(p);
    });
    router.put("/:id", requireRole("superadmin"), async (req, res) => {
      try {
        const p = await Personnel.findById(req.params.id);
        if (!p) return res.status(404).json({ error: "Not found" });
        const { name, duties, capacity, status } = req.body;
        if (name !== void 0) p.name = name;
        if (duties !== void 0) p.duties = duties;
        if (capacity !== void 0) p.capacity = capacity;
        if (status !== void 0) p.status = status;
        await p.save();
        res.json(p);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
    router.delete("/:id", requireRole("superadmin"), async (req, res) => {
      await Personnel.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    });
    module2.exports = router;
  }
});
var require_Client = __commonJS({
  "models/Client.js"(exports2, module2) {
    var mongoose = require("mongoose");
    var ClientSchema = new mongoose.Schema({
      name: { type: String, required: true, trim: true },
      notes: { type: String, default: "" }
    }, { timestamps: true });
    module2.exports = mongoose.model("Client", ClientSchema);
  }
});
var require_clients = __commonJS({
  "routes/clients.js"(exports2, module2) {
    var express2 = require("express");
    var Client = require_Client();
    var { verifyToken, requireRole } = require_auth();
    var router = express2.Router();
    router.use(verifyToken);
    router.get("/", async (req, res) => {
      if (req.user.role === "client") {
        if (!req.user.clientId) return res.json([]);
        const c = await Client.findById(req.user.clientId);
        return res.json(c ? [c] : []);
      }
      const list = await Client.find().sort("name");
      res.json(list);
    });
    router.post("/", requireRole("superadmin", "employee"), async (req, res) => {
      const { name, notes } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const c = await Client.create({ name, notes });
      res.status(201).json(c);
    });
    router.put("/:id", requireRole("superadmin"), async (req, res) => {
      const { name, notes } = req.body;
      const c = await Client.findByIdAndUpdate(req.params.id, { name, notes }, { new: true });
      if (!c) return res.status(404).json({ error: "Not found" });
      res.json(c);
    });
    router.delete("/:id", requireRole("superadmin"), async (req, res) => {
      await Client.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    });
    module2.exports = router;
  }
});
var require_Service = __commonJS({
  "models/Service.js"(exports2, module2) {
    var mongoose = require("mongoose");
    var ServiceSchema = new mongoose.Schema({
      name: { type: String, required: true, trim: true },
      hours: { type: Number, default: 0 }
      // reference / informational effort estimate
    }, { timestamps: true });
    module2.exports = mongoose.model("Service", ServiceSchema);
  }
});
var require_services = __commonJS({
  "routes/services.js"(exports2, module2) {
    var express2 = require("express");
    var Service = require_Service();
    var { verifyToken, requireRole } = require_auth();
    var router = express2.Router();
    router.use(verifyToken);
    router.get("/", async (req, res) => {
      const list = await Service.find().sort("name");
      res.json(list);
    });
    router.post("/", requireRole("superadmin", "employee"), async (req, res) => {
      const { name, hours } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const s = await Service.create({ name, hours });
      res.status(201).json(s);
    });
    router.put("/:id", requireRole("superadmin"), async (req, res) => {
      const { name, hours } = req.body;
      const s = await Service.findByIdAndUpdate(req.params.id, { name, hours }, { new: true });
      if (!s) return res.status(404).json({ error: "Not found" });
      res.json(s);
    });
    router.delete("/:id", requireRole("superadmin"), async (req, res) => {
      await Service.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    });
    module2.exports = router;
  }
});
var require_Job = __commonJS({
  "models/Job.js"(exports2, module2) {
    var mongoose = require("mongoose");
    var AssignmentSchema = new mongoose.Schema({
      personId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel", required: true },
      percent: { type: Number, default: 0 },
      // % of job revenue credited to this person
      hours: { type: Number, default: 0 }
      // hours actually spent
    }, { _id: false });
    var JobSchema = new mongoose.Schema({
      title: { type: String, default: "" },
      clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
      serviceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service" }],
      serviceNames: [{ type: String }],
      date: { type: Date, required: true },
      completionDate: { type: Date, default: null },
      // Expected End Date
      status: { type: String, enum: ["In Progress", "Completed"], default: "In Progress" },
      // Completion status
      value: { type: Number, default: 0 },
      description: { type: String, default: "" },
      priority: { type: String, enum: ["Medium", "High", "Urgent"], default: "Medium" },
      preferredPersonId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel", default: null },
      preferredPersonName: { type: String, default: "" },
      assignments: [AssignmentSchema],
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
    }, { timestamps: true });
    module2.exports = mongoose.model("Job", JobSchema);
  }
});
var require_Notification = __commonJS({
  "models/Notification.js"(exports2, module2) {
    var mongoose = require("mongoose");
    var NotificationSchema = new mongoose.Schema({
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      type: {
        type: String,
        enum: ["job_created", "job_updated", "job_assigned", "job_due", "status_changed"],
        required: true
      },
      title: { type: String, required: true },
      message: { type: String, required: true },
      jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", default: null },
      read: { type: Boolean, default: false }
    }, { timestamps: true });
    module2.exports = mongoose.model("Notification", NotificationSchema);
  }
});
var require_notify = __commonJS({
  "utils/notify.js"(exports2, module2) {
    var Notification = require_Notification();
    var User = require_User();
    var Personnel = require_Personnel();
    var Client = require_Client();
    async function createNotificationsForJob({ type, title, message, job, actorId }) {
      try {
        if (!job) return;
        const targetUserIds = /* @__PURE__ */ new Set();
        const superadmins = await User.find({ role: "superadmin", active: true });
        superadmins.forEach((u) => targetUserIds.add(String(u._id)));
        if (job.assignments && job.assignments.length) {
          const pIds = job.assignments.map((a) => a.personId).filter(Boolean);
          if (pIds.length) {
            const assignedUsers = await User.find({ personnelId: { $in: pIds }, active: true });
            assignedUsers.forEach((u) => targetUserIds.add(String(u._id)));
          }
        }
        if (job.clientId) {
          const clientUsers = await User.find({ clientId: job.clientId, active: true });
          clientUsers.forEach((u) => targetUserIds.add(String(u._id)));
        }
        if (job.createdBy) {
          targetUserIds.add(String(job.createdBy));
        }
        const docs = Array.from(targetUserIds).map((uId) => ({
          userId: uId,
          type,
          title,
          message,
          jobId: job._id,
          read: false
        }));
        if (docs.length) {
          await Notification.insertMany(docs);
        }
      } catch (err) {
        console.error("Error creating notifications:", err.message);
      }
    }
    module2.exports = { createNotificationsForJob };
  }
});
var require_jobs = __commonJS({
  "routes/jobs.js"(exports2, module2) {
    var express2 = require("express");
    var Job = require_Job();
    var Service = require_Service();
    var Personnel = require_Personnel();
    var { verifyToken, requireRole } = require_auth();
    var { createNotificationsForJob } = require_notify();
    var router = express2.Router();
    router.use(verifyToken);
    router.get("/", async (req, res) => {
      const filter = {};
      if (req.user.role === "client") {
        if (!req.user.clientId) return res.json([]);
        filter.clientId = req.user.clientId;
      } else if (req.query.mine === "true" && req.user.personnelId) {
        filter["assignments.personId"] = req.user.personnelId;
      }
      if (req.query.clientId) filter.clientId = req.query.clientId;
      const jobs = await Job.find(filter).sort("-date").lean();
      res.json(jobs);
    });
    router.post("/", requireRole("superadmin", "employee", "client"), async (req, res) => {
      try {
        let { title, clientId, serviceIds, date, completionDate, status, value, description, priority, preferredPersonId, assignments } = req.body;
        if (req.user.role === "client") {
          if (!req.user.clientId) return res.status(400).json({ error: "No client profile linked to this user" });
          clientId = req.user.clientId;
          if (!assignments || !assignments.length) {
            assignments = [];
            if (preferredPersonId) {
              assignments.push({
                personId: preferredPersonId,
                percent: 100,
                hours: 0
              });
            } else {
              const defaultPersons = await Personnel.find({ name: { $in: [/mansi/i, /urna/i] } });
              defaultPersons.forEach((p) => {
                assignments.push({
                  personId: p._id,
                  percent: 0,
                  hours: 0
                });
              });
            }
          }
        }
        if (!clientId) return res.status(400).json({ error: "Client is required" });
        if (!serviceIds || !serviceIds.length) return res.status(400).json({ error: "At least one service is required" });
        if (!date) return res.status(400).json({ error: "Start date is required" });
        if (req.user.role !== "client") {
          if (!assignments || !assignments.length) return res.status(400).json({ error: "At least one person must be assigned" });
          for (const a of assignments) {
            if (a.hours === "" || a.hours == null) return res.status(400).json({ error: "Enter hours spent for every assigned person" });
          }
        }
        const services = await Service.find({ _id: { $in: serviceIds } });
        const serviceNames = services.map((s) => s.name);
        let preferredPersonName = "";
        if (preferredPersonId) {
          const prefPerson = await Personnel.findById(preferredPersonId);
          if (prefPerson) preferredPersonName = prefPerson.name;
        }
        const validPriorities = ["Medium", "High", "Urgent"];
        const jobPriority = validPriorities.includes(priority) ? priority : "Medium";
        const job = await Job.create({
          title: title || "",
          clientId,
          serviceIds,
          serviceNames,
          date,
          completionDate: completionDate || null,
          // End Date / Expected Date
          status: status || "In Progress",
          // Completion status (default In Progress)
          value: Number(value) || 0,
          description: description || "",
          priority: jobPriority,
          preferredPersonId: preferredPersonId || null,
          preferredPersonName,
          assignments: (assignments || []).map((a) => ({ personId: a.personId, percent: Number(a.percent) || 0, hours: Number(a.hours) || 0 })),
          createdBy: req.user._id
        });
        await createNotificationsForJob({
          type: "job_created",
          title: "New Job Logged",
          message: `Job "${job.title || "Untitled"}" was logged.`,
          job,
          actorId: req.user._id
        });
        res.status(201).json(job);
      } catch (err) {
        res.status(500).json({ error: "Could not save job", detail: err.message });
      }
    });
    router.patch("/:id/status", requireRole("superadmin", "employee"), async (req, res) => {
      try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ error: "Job not found" });
        if (req.body.completed === true) {
          job.status = "Completed";
        } else if (req.body.completed === false) {
          job.status = "In Progress";
        } else if (req.body.status) {
          job.status = req.body.status;
        } else {
          job.status = job.status === "Completed" ? "In Progress" : "Completed";
        }
        await job.save();
        await createNotificationsForJob({
          type: "status_changed",
          title: "Job Status Updated",
          message: `Job "${job.title || "Untitled"}" is now ${job.status}.`,
          job,
          actorId: req.user._id
        });
        res.json(job);
      } catch (err) {
        res.status(500).json({ error: "Could not update status", detail: err.message });
      }
    });
    router.put("/:id", requireRole("superadmin", "employee"), async (req, res) => {
      const job = await Job.findById(req.params.id);
      if (!job) return res.status(404).json({ error: "Not found" });
      if (req.user.role === "employee") {
        const userPId = String(req.user.personnelId?._id || req.user.personnelId || "");
        const isAssigned = (job.assignments || []).some((a) => String(a.personId) === userPId);
        const isCreator = String(job.createdBy) === String(req.user._id);
        if (!isAssigned && !isCreator) {
          return res.status(403).json({ error: "You can only edit jobs assigned to you or logged yourself" });
        }
      }
      const { title, clientId, serviceIds, date, completionDate, status, value, description, priority, preferredPersonId, assignments } = req.body;
      if (title !== void 0) job.title = title;
      if (clientId) job.clientId = clientId;
      if (serviceIds) {
        job.serviceIds = serviceIds;
        const services = await Service.find({ _id: { $in: serviceIds } });
        job.serviceNames = services.map((s) => s.name);
      }
      if (date) job.date = date;
      if (completionDate !== void 0) job.completionDate = completionDate || null;
      if (status) job.status = status;
      if (value !== void 0) job.value = Number(value) || 0;
      if (description !== void 0) job.description = description;
      if (priority && ["Medium", "High", "Urgent"].includes(priority)) job.priority = priority;
      if (preferredPersonId !== void 0) {
        job.preferredPersonId = preferredPersonId || null;
        if (preferredPersonId) {
          const prefPerson = await Personnel.findById(preferredPersonId);
          job.preferredPersonName = prefPerson ? prefPerson.name : "";
        } else {
          job.preferredPersonName = "";
        }
      }
      if (assignments) {
        const validAss = (assignments || []).filter((a) => a && a.personId && String(a.personId).trim() !== "");
        job.assignments = validAss.map((a) => ({ personId: a.personId, percent: Number(a.percent) || 0, hours: Number(a.hours) || 0 }));
      }
      await job.save();
      await createNotificationsForJob({
        type: "job_updated",
        title: "Job Details Updated",
        message: `Job "${job.title || "Untitled"}" was updated.`,
        job,
        actorId: req.user._id
      });
      res.json(job);
    });
    router.delete("/:id", requireRole("superadmin", "employee"), async (req, res) => {
      const job = await Job.findById(req.params.id);
      if (!job) return res.status(404).json({ error: "Not found" });
      if (req.user.role === "employee" && String(job.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ error: "You can only delete jobs you logged yourself" });
      }
      await Job.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    });
    module2.exports = router;
  }
});
var require_Roster = __commonJS({
  "models/Roster.js"(exports2, module2) {
    var mongoose = require("mongoose");
    var RosterSchema = new mongoose.Schema({
      clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
      nature: { type: String, enum: ["Existing", "Prospect"], default: "Existing" },
      roles: {
        strategy: { type: String, default: "" },
        cs: { type: String, default: "" },
        website: { type: String, default: "" },
        design: { type: String, default: "" },
        copy: { type: String, default: "" },
        edit: { type: String, default: "" },
        shoot: { type: String, default: "" },
        seo: { type: String, default: "" },
        smo: { type: String, default: "" },
        qc: { type: String, default: "" }
      },
      difficulty: { type: Number, min: 1, max: 10, default: 5 },
      comments: { type: String, default: "" }
    }, { timestamps: true });
    module2.exports = mongoose.model("Roster", RosterSchema);
  }
});
var require_roster = __commonJS({
  "routes/roster.js"(exports2, module2) {
    var express2 = require("express");
    var Roster = require_Roster();
    var { verifyToken, requireRole } = require_auth();
    var router = express2.Router();
    router.use(verifyToken);
    router.get("/", async (req, res) => {
      const filter = {};
      if (req.user.role === "client") {
        if (!req.user.clientId) return res.json([]);
        filter.clientId = req.user.clientId;
      }
      const list = await Roster.find(filter).sort("-difficulty");
      res.json(list);
    });
    router.post("/", requireRole("superadmin"), async (req, res) => {
      const { clientId, nature, roles, difficulty, comments } = req.body;
      if (!clientId) return res.status(400).json({ error: "Client is required" });
      const r = await Roster.create({ clientId, nature, roles, difficulty, comments });
      res.status(201).json(r);
    });
    router.put("/:id", requireRole("superadmin"), async (req, res) => {
      const { nature, roles, difficulty, comments } = req.body;
      const r = await Roster.findByIdAndUpdate(req.params.id, { nature, roles, difficulty, comments }, { new: true });
      if (!r) return res.status(404).json({ error: "Not found" });
      res.json(r);
    });
    router.delete("/:id", requireRole("superadmin"), async (req, res) => {
      await Roster.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    });
    router.post("/reassign", requireRole("superadmin"), async (req, res) => {
      const { from, to } = req.body;
      if (!from || !to) return res.status(400).json({ error: "from and to are required" });
      const roleKeys = ["strategy", "cs", "website", "design", "copy", "edit", "shoot", "seo", "smo", "qc"];
      const all = await Roster.find();
      let count = 0;
      for (const r of all) {
        let changed = false;
        roleKeys.forEach((key) => {
          const names = String(r.roles[key] || "").split(",").map((s) => s.trim()).filter(Boolean);
          if (names.includes(from)) {
            const replaced = [...new Set(names.map((n) => n === from ? to : n))];
            r.roles[key] = replaced.join(", ");
            changed = true;
          }
        });
        if (changed) {
          count += 1;
          await r.save();
        }
      }
      res.json({ ok: true, accountsUpdated: count });
    });
    module2.exports = router;
  }
});
var require_Target = __commonJS({
  "models/Target.js"(exports2, module2) {
    var mongoose = require("mongoose");
    var TargetSchema = new mongoose.Schema({
      personId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel", required: true },
      serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
      quantity: { type: Number, default: 1 },
      unit: { type: String, enum: ["count", "hours"], default: "count" },
      period: { type: String, enum: ["day", "week", "month"], default: "day" }
    }, { timestamps: true });
    module2.exports = mongoose.model("Target", TargetSchema);
  }
});
var require_stats = __commonJS({
  "utils/stats.js"(exports2, module2) {
    function startOfDay(d) {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    }
    function startOfWeek(d) {
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const m = new Date(d);
      m.setDate(d.getDate() + diff);
      m.setHours(0, 0, 0, 0);
      return m;
    }
    function startOfMonth(d) {
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    function startOfQuarter(d) {
      const q = Math.floor(d.getMonth() / 3);
      return new Date(d.getFullYear(), q * 3, 1);
    }
    function periodRange(period) {
      const now = /* @__PURE__ */ new Date();
      let from, to = now;
      if (period === "today") {
        from = startOfDay(now);
      } else if (period === "week") {
        from = startOfWeek(now);
      } else if (period === "quarter") {
        from = startOfQuarter(now);
      } else if (period === "all") {
        from = new Date(2e3, 0, 1);
      } else {
        from = startOfMonth(now);
      }
      return { from, to };
    }
    function weeksBetween(from, to) {
      return Math.max((to - from) / 864e5 / 7, 1 / 7);
    }
    function utilStatus(u) {
      if (u >= 115) return { label: "Overworked", cls: "red" };
      if (u >= 90) return { label: "Stretched", cls: "amber" };
      if (u >= 55) return { label: "Balanced", cls: "green" };
      if (u >= 25) return { label: "Underutilised", cls: "blue" };
      return { label: "Idle", cls: "gray" };
    }
    function computePersonStats(jobs, personnelList, from, to) {
      const weeks = weeksBetween(from, to);
      const map = {};
      personnelList.forEach((p) => {
        map[String(p._id)] = { person: p, hours: 0, revenue: 0, jobCount: 0 };
      });
      jobs.forEach((job) => {
        (job.assignments || []).forEach((a) => {
          const key = String(a.personId);
          const bucket = map[key];
          if (!bucket) return;
          bucket.hours += Number(a.hours) || 0;
          bucket.revenue += (Number(job.value) || 0) * (Number(a.percent) || 0) / 100;
          bucket.jobCount += 1;
        });
      });
      Object.values(map).forEach((b) => {
        const capacityHours = (b.person.capacity || 48) * weeks;
        b.capacityHours = capacityHours;
        b.utilization = capacityHours > 0 ? b.hours / capacityHours * 100 : 0;
      });
      return map;
    }
    function computeClientStats(jobs, clientsList) {
      const map = {};
      clientsList.forEach((c) => {
        map[String(c._id)] = { client: c, value: 0, hours: 0, jobCount: 0, peopleSet: /* @__PURE__ */ new Set(), services: {} };
      });
      jobs.forEach((job) => {
        const bucket = map[String(job.clientId)];
        if (!bucket) return;
        bucket.value += Number(job.value) || 0;
        bucket.jobCount += 1;
        (job.serviceNames || []).forEach((n) => {
          bucket.services[n] = (bucket.services[n] || 0) + 1;
        });
        (job.assignments || []).forEach((a) => {
          bucket.hours += Number(a.hours) || 0;
          bucket.peopleSet.add(String(a.personId));
        });
      });
      return map;
    }
    function filterJobsInRange(jobs, from, to) {
      const toEnd = new Date(to.getTime() + 86399999);
      return jobs.filter((j) => {
        const d = new Date(j.date);
        return d >= from && d <= toEnd;
      });
    }
    function computeRosterLoad(rosterList, roleKeys) {
      const load = {};
      rosterList.forEach((r) => {
        const names = /* @__PURE__ */ new Set();
        roleKeys.forEach((key) => {
          String((r.roles || {})[key] || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((n) => {
            if (n && n !== "TBD") names.add(n);
          });
        });
        names.forEach((n) => {
          load[n] = load[n] || { accounts: 0, difficultySum: 0 };
          load[n].accounts += 1;
          load[n].difficultySum += Number(r.difficulty) || 0;
        });
      });
      return load;
    }
    var ROLE_KEYS = ["strategy", "cs", "website", "design", "copy", "edit", "shoot", "seo", "smo", "qc"];
    module2.exports = {
      periodRange,
      weeksBetween,
      utilStatus,
      computePersonStats,
      computeClientStats,
      filterJobsInRange,
      computeRosterLoad,
      ROLE_KEYS,
      startOfDay,
      startOfWeek,
      startOfMonth
    };
  }
});
var require_targets = __commonJS({
  "routes/targets.js"(exports2, module2) {
    var express2 = require("express");
    var Target = require_Target();
    var Job = require_Job();
    var { verifyToken, requireRole } = require_auth();
    var { startOfDay, startOfWeek, startOfMonth } = require_stats();
    var router = express2.Router();
    router.use(verifyToken);
    async function actualForTarget(t) {
      const now = /* @__PURE__ */ new Date();
      let from;
      if (t.period === "day") from = startOfDay(now);
      else if (t.period === "week") from = startOfWeek(now);
      else from = startOfMonth(now);
      const jobs = await Job.find({
        serviceIds: t.serviceId,
        date: { $gte: from, $lte: now },
        "assignments.personId": t.personId
      }).lean();
      let count = 0, hours = 0;
      jobs.forEach((j) => {
        (j.assignments || []).forEach((a) => {
          if (String(a.personId) === String(t.personId)) {
            count += 1;
            hours += Number(a.hours) || 0;
          }
        });
      });
      return t.unit === "hours" ? hours : count;
    }
    router.get("/", async (req, res) => {
      let filter = {};
      if (req.user.role === "employee" && req.query.mine === "true") filter.personId = req.user.personnelId;
      const targets = await Target.find(filter).populate("personId", "name").populate("serviceId", "name");
      const withActuals = await Promise.all(targets.map(async (t) => ({
        ...t.toObject(),
        actual: await actualForTarget(t)
      })));
      res.json(withActuals);
    });
    router.post("/", requireRole("superadmin"), async (req, res) => {
      const { personId, serviceId, quantity, unit, period } = req.body;
      if (!personId || !serviceId) return res.status(400).json({ error: "Person and service are required" });
      const t = await Target.create({ personId, serviceId, quantity, unit, period });
      res.status(201).json(t);
    });
    router.put("/:id", requireRole("superadmin"), async (req, res) => {
      const { quantity, unit, period } = req.body;
      const t = await Target.findByIdAndUpdate(req.params.id, { quantity, unit, period }, { new: true });
      if (!t) return res.status(404).json({ error: "Not found" });
      res.json(t);
    });
    router.delete("/:id", requireRole("superadmin"), async (req, res) => {
      await Target.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    });
    module2.exports = router;
  }
});
var require_SalaryGrade = __commonJS({
  "models/SalaryGrade.js"(exports2, module2) {
    var mongoose = require("mongoose");
    var SalaryGradeSchema = new mongoose.Schema({
      label: { type: String, required: true },
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 }
    }, { timestamps: true });
    module2.exports = mongoose.model("SalaryGrade", SalaryGradeSchema);
  }
});
var require_SalaryAssignment = __commonJS({
  "models/SalaryAssignment.js"(exports2, module2) {
    var mongoose = require("mongoose");
    var SalaryAssignmentSchema = new mongoose.Schema({
      personId: { type: mongoose.Schema.Types.ObjectId, ref: "Personnel", required: true, unique: true },
      gradeId: { type: mongoose.Schema.Types.ObjectId, ref: "SalaryGrade", required: true }
    }, { timestamps: true });
    module2.exports = mongoose.model("SalaryAssignment", SalaryAssignmentSchema);
  }
});
var require_salary = __commonJS({
  "routes/salary.js"(exports2, module2) {
    var express2 = require("express");
    var SalaryGrade = require_SalaryGrade();
    var SalaryAssignment = require_SalaryAssignment();
    var { verifyToken, requireRole } = require_auth();
    var router = express2.Router();
    router.use(verifyToken, requireRole("superadmin"));
    router.get("/grades", async (req, res) => {
      res.json(await SalaryGrade.find().sort("min"));
    });
    router.post("/grades", async (req, res) => {
      const { label, min, max } = req.body;
      if (!label) return res.status(400).json({ error: "Label is required" });
      res.status(201).json(await SalaryGrade.create({ label, min, max }));
    });
    router.put("/grades/:id", async (req, res) => {
      const { label, min, max } = req.body;
      const g = await SalaryGrade.findByIdAndUpdate(req.params.id, { label, min, max }, { new: true });
      if (!g) return res.status(404).json({ error: "Not found" });
      res.json(g);
    });
    router.delete("/grades/:id", async (req, res) => {
      await SalaryGrade.findByIdAndDelete(req.params.id);
      await SalaryAssignment.deleteMany({ gradeId: req.params.id });
      res.json({ ok: true });
    });
    router.get("/assignments", async (req, res) => {
      res.json(await SalaryAssignment.find());
    });
    router.put("/assignments/:personId", async (req, res) => {
      const { gradeId } = req.body;
      if (!gradeId) {
        await SalaryAssignment.findOneAndDelete({ personId: req.params.personId });
        return res.json({ ok: true, cleared: true });
      }
      const a = await SalaryAssignment.findOneAndUpdate(
        { personId: req.params.personId },
        { personId: req.params.personId, gradeId },
        { new: true, upsert: true }
      );
      res.json(a);
    });
    module2.exports = router;
  }
});
var require_dashboard = __commonJS({
  "routes/dashboard.js"(exports2, module2) {
    var express2 = require("express");
    var Job = require_Job();
    var Personnel = require_Personnel();
    var Client = require_Client();
    var Roster = require_Roster();
    var { verifyToken, requireRole } = require_auth();
    var {
      periodRange,
      weeksBetween,
      utilStatus,
      computePersonStats,
      computeClientStats,
      filterJobsInRange,
      computeRosterLoad,
      ROLE_KEYS
    } = require_stats();
    var router = express2.Router();
    router.use(verifyToken);
    function buildInsights(personMap) {
      const out = [];
      const active = Object.values(personMap).filter((b) => b.person.status !== "vendor" && b.person.status !== "inactive");
      const overworked = active.filter((b) => utilStatus(b.utilization).label === "Overworked").sort((a, b) => b.utilization - a.utilization);
      overworked.slice(0, 5).forEach((b) => {
        out.push({
          type: "red",
          text: `${b.person.name} is running at ${b.utilization.toFixed(0)}% of capacity (${b.hours.toFixed(1)} hrs logged). Duties: ${b.person.duties}. Consider redistributing work, backfilling with a hire, or leaning on external support for overflow.`
        });
      });
      const idle = active.filter((b) => ["Idle", "Underutilised"].includes(utilStatus(b.utilization).label) && b.hours > 0).sort((a, b) => a.utilization - b.utilization);
      idle.slice(0, 4).forEach((b) => {
        out.push({ type: "blue", text: `${b.person.name} is at ${b.utilization.toFixed(0)}% of capacity. There's room here \u2014 consider cross-training toward a stretched role, or reassigning accounts.` });
      });
      return out;
    }
    router.get("/admin", requireRole("superadmin"), async (req, res) => {
      const period = req.query.period || "month";
      const { from, to } = periodRange(period);
      const [allJobs, personnel, clients, roster] = await Promise.all([
        Job.find().lean(),
        Personnel.find().lean(),
        Client.find().lean(),
        Roster.find().lean()
      ]);
      const jobs = filterJobsInRange(allJobs, from, to);
      const personMap = computePersonStats(jobs, personnel, from, to);
      const clientMap = computeClientStats(jobs, clients);
      const rosterLoad = computeRosterLoad(roster, ROLE_KEYS);
      let totalValue = 0, totalHours = 0;
      jobs.forEach((j) => {
        totalValue += Number(j.value) || 0;
        (j.assignments || []).forEach((a) => {
          totalHours += Number(a.hours) || 0;
        });
      });
      const personArr = Object.values(personMap).map((b) => ({
        personId: b.person._id,
        name: b.person.name,
        duties: b.person.duties,
        status: b.person.status,
        hours: b.hours,
        revenue: b.revenue,
        jobCount: b.jobCount,
        utilization: b.utilization,
        ...utilStatus(b.utilization)
      })).sort((a, b) => b.utilization - a.utilization);
      const clientArr = Object.values(clientMap).map((c) => ({
        clientId: c.client._id,
        name: c.client.name,
        value: c.value,
        hours: c.hours,
        jobCount: c.jobCount,
        peopleCount: c.peopleSet.size,
        services: c.services
      })).sort((a, b) => b.value - a.value);
      const svcTotals = {};
      jobs.forEach((j) => {
        const names = j.serviceNames && j.serviceNames.length ? j.serviceNames : ["\u2014"];
        const share = (Number(j.value) || 0) / names.length;
        names.forEach((n) => {
          svcTotals[n] = (svcTotals[n] || 0) + share;
        });
      });
      const serviceArr = Object.entries(svcTotals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
      res.json({
        period,
        from,
        to,
        overview: {
          totalValue,
          totalHours,
          totalJobs: jobs.length,
          activeClients: new Set(jobs.map((j) => String(j.clientId))).size,
          totalClients: clients.length,
          overworked: personArr.filter((p) => p.label === "Overworked").length,
          underused: personArr.filter((p) => p.label === "Idle" || p.label === "Underutilised").length
        },
        insights: buildInsights(personMap),
        personnel: personArr,
        clients: clientArr,
        services: serviceArr,
        rosterLoad
      });
    });
    router.get("/employee", requireRole("employee"), async (req, res) => {
      if (!req.user.personnelId) return res.status(400).json({ error: "This login is not linked to a personnel record. Ask your admin to link it." });
      const period = req.query.period || "month";
      const { from, to } = periodRange(period);
      const weeks = weeksBetween(from, to);
      const [allJobs, person, roster] = await Promise.all([
        Job.find({ "assignments.personId": req.user.personnelId }).populate("clientId", "name").lean(),
        Personnel.findById(req.user.personnelId).lean(),
        Roster.find().lean()
      ]);
      if (!person) return res.status(404).json({ error: "Personnel record not found" });
      const jobs = filterJobsInRange(allJobs, from, to);
      let hours = 0, revenue = 0;
      jobs.forEach((j) => {
        (j.assignments || []).forEach((a) => {
          if (String(a.personId) === String(req.user.personnelId)) {
            hours += Number(a.hours) || 0;
            revenue += (Number(j.value) || 0) * (Number(a.percent) || 0) / 100;
          }
        });
      });
      const capacityHours = (person.capacity || 48) * weeks;
      const utilization = capacityHours > 0 ? hours / capacityHours * 100 : 0;
      const myAccounts = roster.filter((r) => ROLE_KEYS.some((k) => String(r.roles[k] || "").split(",").map((s) => s.trim()).includes(person.name)));
      res.json({
        period,
        from,
        to,
        person: { name: person.name, duties: person.duties, capacity: person.capacity, status: person.status },
        stats: { hours, revenue, jobCount: jobs.length, utilization, ...utilStatus(utilization) },
        recentJobs: jobs.slice(0, 20),
        accountsCount: myAccounts.length,
        accounts: myAccounts.map((r) => ({ id: r._id, clientId: r.clientId, difficulty: r.difficulty, nature: r.nature }))
      });
    });
    router.get("/client", requireRole("client"), async (req, res) => {
      if (!req.user.clientId) return res.status(400).json({ error: "This login is not linked to a client record. Ask your admin to link it." });
      const period = req.query.period || "month";
      const { from, to } = periodRange(period);
      const [allJobs, client, rosterEntries] = await Promise.all([
        Job.find({ clientId: req.user.clientId }).lean(),
        Client.findById(req.user.clientId).lean(),
        Roster.find({ clientId: req.user.clientId }).lean()
      ]);
      const jobs = filterJobsInRange(allJobs, from, to);
      let value = 0, hours = 0;
      jobs.forEach((j) => {
        value += Number(j.value) || 0;
        (j.assignments || []).forEach((a) => {
          hours += Number(a.hours) || 0;
        });
      });
      res.json({
        period,
        from,
        to,
        client,
        stats: { value, hours, jobCount: jobs.length, completed: jobs.filter((j) => j.completionDate).length, inProgress: jobs.filter((j) => !j.completionDate).length },
        roster: rosterEntries,
        jobs: allJobs.sort((a, b) => new Date(b.date) - new Date(a.date))
      });
    });
    module2.exports = router;
  }
});
var require_notifications = __commonJS({
  "routes/notifications.js"(exports2, module2) {
    var express2 = require("express");
    var router = express2.Router();
    var Notification = require_Notification();
    var Job = require_Job();
    var { verifyToken } = require_auth();
    router.use(verifyToken);
    router.get("/", async (req, res) => {
      try {
        const userId = req.user._id;
        const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        let jobFilter = { status: { $ne: "Completed" } };
        if (req.user.role === "employee" && req.user.personnelId) {
          jobFilter["assignments.personId"] = req.user.personnelId;
        } else if (req.user.role === "client" && req.user.clientId) {
          jobFilter.clientId = req.user.clientId;
        }
        const upcomingJobs = await Job.find(jobFilter).limit(20);
        for (const j of upcomingJobs) {
          const jobDateStr = j.completionDate ? new Date(j.completionDate).toISOString().slice(0, 10) : j.date ? new Date(j.date).toISOString().slice(0, 10) : null;
          if (jobDateStr && jobDateStr <= todayStr) {
            const existing = await Notification.findOne({ userId, jobId: j._id, type: "job_due" });
            if (!existing) {
              await Notification.create({
                userId,
                type: "job_due",
                title: jobDateStr < todayStr ? "\u26A0\uFE0F Overdue Job" : "\u23F3 Job Due Today",
                message: `Job "${j.title || "Untitled Job"}" is ${jobDateStr < todayStr ? "overdue" : "due today"}.`,
                jobId: j._id,
                read: false
              });
            }
          }
        }
        const notifications = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(30);
        const unreadCount = await Notification.countDocuments({ userId, read: false });
        res.json({ notifications, unreadCount });
      } catch (err) {
        res.status(500).json({ error: "Could not fetch notifications", detail: err.message });
      }
    });
    router.patch("/read", async (req, res) => {
      try {
        await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Could not mark notifications read", detail: err.message });
      }
    });
    router.delete("/", async (req, res) => {
      try {
        await Notification.deleteMany({ userId: req.user._id });
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Could not clear notifications", detail: err.message });
      }
    });
    module2.exports = router;
  }
});
require("dotenv").config();
var path = require("path");
var express = require("express");
var cors = require("cors");
var connectDB = require_db();
var app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
connectDB();
app.use("/api/auth", require_auth2());
app.use("/api/users", require_users());
app.use("/api/personnel", require_personnel());
app.use("/api/clients", require_clients());
app.use("/api/services", require_services());
app.use("/api/jobs", require_jobs());
app.use("/api/roster", require_roster());
app.use("/api/targets", require_targets());
app.use("/api/salary", require_salary());
app.use("/api/dashboard", require_dashboard());
app.use("/api/notifications", require_notifications());
var webDistPath = path.join(__dirname, "../web/dist");
app.use(express.static(webDistPath));
app.get("/", (req, res) => res.json({ ok: true, message: "CI360 Productivity Suite Backend API is running" }));
app.get("/api/health", (req, res) => res.json({ ok: true, time: /* @__PURE__ */ new Date() }));
var PORT = process.env.PORT || 4e3;
app.listen(PORT, () => console.log(`CI360 backend server running on http://localhost:${PORT}`));
