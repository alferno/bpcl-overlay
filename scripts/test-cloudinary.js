const cloudinary = require('cloudinary').v2;

process.env.CLOUDINARY_URL="cloudinary://498589837975162:TY7hgP33zKu93yrONVl5vNU9N1s@alferno";

async function test() {
  try {
    const res = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_large("package.json", { resource_type: "raw" }, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
    console.log(res);
  } catch(e) {
    console.error(e);
  }
}
test();
