const mongoose = require('mongoose');
require('dotenv').config();

const run = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection;
        const restaurants = await db.collection('restaurants').find({}).toArray();

        if (restaurants.length > 0) {
            console.log('ID:' + restaurants[0]._id.toString());
        } else {
            console.log('NONE');
        }

        mongoose.disconnect();
    } catch (error) {
        console.error(error);
    }
};

run();
