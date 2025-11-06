const cloudinary = require('cloudinary').v2;

let isConfigured = false;

const ensureConfigured = () => {
    if (isConfigured) {
        return;
    }

    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
        throw new Error('Cloudinary credentials are not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
    }

    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET
    });

    isConfigured = true;
};

const uploadBuffer = (buffer, options = {}) => {
    ensureConfigured();

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) {
                return reject(error);
            }
            resolve(result);
        });

        uploadStream.end(buffer);
    });
};

const deleteResource = async (publicId, options = {}) => {
    ensureConfigured();
    if (!publicId) {
        return null;
    }

    try {
        const result = await cloudinary.uploader.destroy(publicId, options);
        return result;
    } catch (error) {
        // Surface error to caller for logging/handling but do not break flow
        throw error;
    }
};

const buildImageUrl = (publicId, options = {}) => {
    ensureConfigured();
    let { transformation, transformations, ...rest } = options;

    if (transformations && !transformation) {
        transformation = transformations;
    }

    if (typeof transformation === 'string') {
        transformation = [{ raw_transformation: transformation }];
    } else if (Array.isArray(transformation)) {
        transformation = transformation.map(item => {
            if (typeof item === 'string') {
                return { raw_transformation: item };
            }
            return item;
        });
    }

    const urlOptions = {
        secure: true,
        ...rest
    };

    if (transformation) {
        urlOptions.transformation = transformation;
    }

    return cloudinary.url(publicId, urlOptions);
};

module.exports = {
    cloudinary,
    ensureConfigured,
    uploadBuffer,
    deleteResource,
    buildImageUrl
};


