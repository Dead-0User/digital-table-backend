const mongoose = require('mongoose');
require('dotenv').config();

const run = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');
        const db = mongoose.connection;

        // 1. Find ANY chef
        console.log('\n--- Searching for ALL chefs ---');
        const chefs = await db.collection('staffs').find({ role: 'chef' }).toArray();

        if (chefs.length === 0) {
            console.log('No chefs found in the entire database!');
        } else {
            chefs.forEach(chef => {
                console.log(`\nFound Chef:
          ID: ${chef._id}
          Username: "${chef.username}"
          Restaurant ID: ${chef.restaurantId}
          Role: ${chef.role}
          Active: ${chef.isActive}
        `);
            });
        }

        // 2. Check the specific restaurant provided by user
        const targetRestId = '69435ef04661eaf9c49c1028';
        console.log(`\n--- Searching in Restaurant ${targetRestId} ---`);

        let restObjectId;
        try {
            restObjectId = new mongoose.Types.ObjectId(targetRestId);
        } catch (e) {
            console.log('Invalid Target Restaurant ID format');
        }

        if (restObjectId) {
            const restStaff = await db.collection('staffs').find({ restaurantId: restObjectId }).toArray();
            console.log(`Found ${restStaff.length} staff members for this restaurant.`);
            restStaff.forEach(s => console.log(` - ${s.username} (${s.role})`));
        }

        mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

run();
