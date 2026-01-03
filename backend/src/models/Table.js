const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  tableName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  qrCodeUrl: {
    type: String,
    required: false,
    default: ''
  },
  seats: {
    type: Number,
    default: 4,
    min: 1,
    max: 20
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for efficient queries by restaurant
tableSchema.index({ restaurantId: 1, isActive: 1 });

module.exports = mongoose.model('Table', tableSchema);

// One-time cleanup for ALL old indexes (run this once, then remove it)
mongoose.connection.once('open', async () => {
  try {
    const collection = mongoose.connection.db.collection('tables');
    const indexes = await collection.indexes();
    
    console.log('Current indexes:', indexes.map(idx => idx.name));
    
    // List of old indexes to remove
    const oldIndexes = ['qrCodeId_1', 'number_1_userId_1'];
    
    for (const indexName of oldIndexes) {
      const hasOldIndex = indexes.some(index => index.name === indexName);
      if (hasOldIndex) {
        console.log(`Dropping old index: ${indexName}...`);
        await collection.dropIndex(indexName);
        console.log(`${indexName} dropped successfully`);
      }
    }
    
    console.log('Index cleanup completed');
  } catch (error) {
    console.log('Index cleanup error:', error.message);
  }
});