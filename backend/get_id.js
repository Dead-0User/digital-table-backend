const mongoose = require('mongoose');
require('dotenv').config();

const run = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection;
        const restaurants = await db.collection('restaurants').find({}).toArray();

        console.log('\n--- CORRECT RESTAURANT ID ---');
        if (restaurants.length > 0) {
            console.log(restaurants[0]._id.toString());
            console.log(`Name: ${restaurants[0].restaurantName}`);
        } else {
            console.log('NO RESTAURANTS FOUND');
        }
        console.log('--- END ---\n');

        mongoose.disconnect();
    } catch (error) {
        console.error(error);
    }
};

run();
