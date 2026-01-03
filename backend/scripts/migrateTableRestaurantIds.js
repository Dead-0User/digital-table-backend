/**
 * Migration Script: Fix Table restaurantId references
 * 
 * This script migrates tables that have User IDs stored in restaurantId
 * to use the correct Restaurant IDs instead.
 * 
 * Run this once after updating the Table model to use Restaurant ref instead of User ref.
 */

const mongoose = require("mongoose");
const Table = require("../src/models/Table");
const Restaurant = require("../src/models/Restaurant");
const User = require("../src/models/User");

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

async function migrateTableRestaurantIds() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/digital-table-magic";
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Find all tables
    const tables = await Table.find({});
    console.log(`📊 Found ${tables.length} tables to check`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const table of tables) {
      try {
        // Check if restaurantId exists in Restaurant collection
        const restaurant = await Restaurant.findById(table.restaurantId);
        
        if (restaurant) {
          // restaurantId is already correct (Restaurant ID)
          skipped++;
          console.log(`⏭️  Table "${table.tableName}" already has correct Restaurant ID`);
          continue;
        }

        // Check if it's a User ID instead
        const user = await User.findById(table.restaurantId);
        
        if (user) {
          // It's a User ID, find the user's restaurant
          const userRestaurant = await Restaurant.findOne({
            ownerId: user._id,
            isActive: true,
          });

          if (userRestaurant) {
            // Update table with correct Restaurant ID
            table.restaurantId = userRestaurant._id;
            await table.save();
            migrated++;
            console.log(`✅ Migrated table "${table.tableName}": User ID ${user._id} → Restaurant ID ${userRestaurant._id}`);
          } else {
            errors++;
            console.error(`❌ No restaurant found for user ${user._id} (table: ${table.tableName})`);
          }
        } else {
          // Neither Restaurant nor User - invalid reference
          errors++;
          console.error(`❌ Invalid restaurantId ${table.restaurantId} for table "${table.tableName}"`);
        }
      } catch (error) {
        errors++;
        console.error(`❌ Error processing table "${table.tableName}":`, error.message);
      }
    }

    console.log("\n📈 Migration Summary:");
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⏭️  Skipped (already correct): ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total: ${tables.length}`);

    await mongoose.disconnect();
    console.log("\n✅ Migration completed!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateTableRestaurantIds()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = migrateTableRestaurantIds;
