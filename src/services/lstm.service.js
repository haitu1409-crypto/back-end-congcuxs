// Use CPU backend - tfjs thay vì tfjs-node
const tf = require('@tensorflow/tfjs');
const NodeCache = require('node-cache');
const XSMB = require('../models/xsmb.model');

class LSTMService {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 3600 });
        this.model = this.buildModel();
        console.log('✅ LSTMService initialized');
    }

    buildModel() {
        const model = tf.sequential();
        model.add(tf.layers.lstm({ units: 50, inputShape: [30, 100] })); // 30 timesteps, 100 features (one-hot for numbers)
        model.add(tf.layers.dense({ units: 100, activation: 'softmax' })); // Output probs for 00-99
        model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy' });
        return model;
    }

    async train(historicalData) {
        // Vectorize data: Chuyển prizes thành sequences [batch, timesteps, features]
        const sequences = this.vectorizeData(historicalData);
        const xs = tf.tensor3d(sequences.xs);
        const ys = tf.tensor2d(sequences.ys);

        await this.model.fit(xs, ys, { epochs: 10, batchSize: 32 });
        tf.dispose([xs, ys]);
    }

    async predict(targetDate, days = 100) {
        const cacheKey = `lstm:${targetDate.toISOString().split('T')[0]}:${days}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        const historicalData = await this.getHistoricalData(targetDate, days);
        await this.train(historicalData); // Fine-tune với data mới

        const input = tf.tensor3d([this.prepareInput(historicalData.slice(0, 30))]); // Last 30 days
        const output = this.model.predict(input);
        const probs = await output.array();
        tf.dispose([input, output]);

        const probabilities = {};
        probs[0].forEach((p, i) => {
            probabilities[i.toString().padStart(2, '0')] = p;
        });

        this.cache.set(cacheKey, probabilities);
        return probabilities;
    }

    // Helpers
    async getHistoricalData(date, days) {
        // Tương tự bayesianCDM
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() - 1);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days);
        return await XSMB.find({ drawDate: { $gte: startDate, $lte: endDate } }).sort({ drawDate: -1 }).lean();
    }

    vectorizeData(data) {
        // Implement vectorization: Chuyển prizes thành one-hot vectors, create xs/ys sequences
        // Ví dụ: xs = data.slice(0,-1), ys = data.slice(1) as one-hot
        return { xs: [], ys: [] }; // Placeholder, implement đầy đủ
    }

    prepareInput(data) {
        // Chuẩn bị input cho predict
        return data.map(item => /* one-hot vector */ Array(100).fill(0));
    }
}

module.exports = LSTMService; 