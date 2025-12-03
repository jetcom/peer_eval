/**
 * S3 Utility for Railway Object Storage
 *
 * Handles image uploads for evaluation attachments using Railway's S3-compatible storage.
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');

// Configuration from environment variables (Railway S3 naming convention)
const S3_ENDPOINT = process.env.AWS_ENDPOINT_URL || process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET;
const S3_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;
const S3_REGION = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';

// Allowed image types and size limit
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_PER_EVALUATION = 5;

// Create S3 client (singleton)
let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;

  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    console.warn('S3 credentials not configured - image uploads disabled');
    return null;
  }

  s3Client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // Required for Railway storage
  });

  return s3Client;
}

/**
 * Check if S3 is configured and available
 */
function isS3Configured() {
  return !!(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);
}

/**
 * Validate file for upload
 * @param {Object} file - Multer file object
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return { valid: false, error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  return { valid: true };
}

/**
 * Generate a unique S3 key for an upload
 * @param {string} evaluationType - 'phase', 'assignment', or 'group'
 * @param {number} evaluationId - The evaluation ID
 * @param {string} originalFilename - Original filename
 * @returns {string} S3 key
 */
function generateS3Key(evaluationType, evaluationId, originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase();
  const hash = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now();

  return `evaluations/${evaluationType}/${evaluationId}/${timestamp}-${hash}${ext}`;
}

/**
 * Upload a file to S3
 * @param {Buffer} buffer - File buffer
 * @param {string} key - S3 key
 * @param {string} mimeType - File MIME type
 * @returns {Promise<{ success: boolean, key?: string, error?: string }>}
 */
async function uploadFile(buffer, key, mimeType) {
  const client = getS3Client();
  if (!client) {
    return { success: false, error: 'S3 not configured' };
  }

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await client.send(command);

    return { success: true, key };
  } catch (error) {
    console.error('S3 upload error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate a presigned URL for viewing an image
 * @param {string} key - S3 key
 * @param {number} expiresIn - URL expiration in seconds (default: 1 hour)
 * @returns {Promise<string|null>}
 */
async function getPresignedUrl(key, expiresIn = 3600) {
  const client = getS3Client();
  if (!client) {
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return null;
  }
}

/**
 * Delete a file from S3
 * @param {string} key - S3 key
 * @returns {Promise<boolean>}
 */
async function deleteFile(key) {
  const client = getS3Client();
  if (!client) {
    return false;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (error) {
    console.error('S3 delete error:', error);
    return false;
  }
}

module.exports = {
  isS3Configured,
  validateFile,
  generateS3Key,
  uploadFile,
  getPresignedUrl,
  deleteFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES_PER_EVALUATION,
};
