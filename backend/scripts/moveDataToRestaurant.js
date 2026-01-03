const mongoose = require("mongoose");
require("dotenv").config();

// Import old User schema with restaurant fields for migration
const oldUserSchema = new mongoose.Schema({}, { strict: false });
const OldUser = mongoose.model("OldUser", oldUserSchema, "users");

// Import new models
const User = require("../src/models/User");
const Restaurant = require("../src/models/Restaurant");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/your_db_name";

async function migrateData() {
  try {
    console.log("🔄 Starting migration...");
    console.log("📡 Connecting to MongoDB...");

    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Get all users with restaurant data
    const oldUsers = await OldUser.find({});
    console.log(`📊 Found ${oldUsers.length} users to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const oldUser of oldUsers) {
      try {
        console.log(`\n🔄 Processing user: ${oldUser.email}`);

        // Check if restaurant already exists for this user
        const existingRestaurant = await Restaurant.findOne({
          ownerId: oldUser._id,
        });

        if (existingRestaurant) {
          console.log(`⏭️  Restaurant already exists for ${oldUser.email}, skipping...`);
          skippedCount++;
          continue;
        }

        // Create new restaurant from old user data
        const restaurantData = {
          ownerId: oldUser._id,
          restaurantName: oldUser.restaurantName || "My Restaurant",
          logo: oldUser.logo || null,
          currency: oldUser.currency || "INR",
          googleMapsUrl: oldUser.googleMapsUrl || "",
          operationalHours: oldUser.operationalHours || "Mon-Sun: 9:00 AM - 10:00 PM",
          templateStyle: oldUser.templateStyle || "classic",
          isActive: true,
          createdAt: oldUser.createdAt || new Date(),
        };

        const newRestaurant = new Restaurant(restaurantData);
        await newRestaurant.save();

        console.log(`✅ Created restaurant: ${restaurantData.restaurantName}`);

        // Update the user document to remove restaurant fields
        await OldUser.updateOne(
          { _id: oldUser._id },
          {
            $unset: {
              restaurantName: "",
              logo: "",
              currency: "",
              googleMapsUrl: "",
              operationalHours: "",
              templateStyle: "",
            },
          }
        );

        console.log(`✅ Cleaned user document for ${oldUser.email}`);
        migratedCount++;
      } catch (err) {
        console.error(`❌ Error migrating user ${oldUser.email}:`, err.message);
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("📊 MIGRATION SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Successfully migrated: ${migratedCount}`);
    console.log(`⏭️  Skipped (already exists): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📝 Total processed: ${oldUsers.length}`);
    console.log("=".repeat(50));

    if (errorCount === 0) {
      console.log("\n✨ Migration completed successfully!");
    } else {
      console.log("\n⚠️  Migration completed with some errors. Please review logs.");
    }
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\n👋 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Confirmation check
console.log("⚠️  WARNING: This script will migrate restaurant data from User to Restaurant model");
console.log("📋 It will:");
console.log("   1. Create Restaurant documents for all users");
console.log("   2. Remove restaurant fields from User documents");
console.log("   3. Skip users that already have restaurants");
console.log("");

const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});

readline.question("Are you sure you want to proceed? (yes/no): ", (answer) => {
  readline.close();
  if (answer.toLowerCase() === "yes") {
    migrateData();
  } else {
    console.log("❌ Migration cancelled");
    process.exit(0);
  }
});