import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import cors from "cors";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import pLimit from "p-limit";
import os from "os";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

async function processImagePipeline(inputPath: string, outputPath: string, mode: string, flags: any) {
  const { isFaceEnhancementEnabled, isBackgroundBlurEnabled, isColorPopEnabled, isSmartHdrEnabled } = flags;
  
  console.log(`Processing image: ${inputPath} -> ${outputPath} (mode: ${mode})`);
  
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const metadata = await sharp(inputPath).metadata();
  console.log(`Metadata: ${JSON.stringify(metadata)}`);
  
  let pipeline = sharp(inputPath);

  const currentWidth = metadata.width || 1000;
  let targetWidth = currentWidth;
  if (currentWidth < 800) {
    targetWidth = currentWidth * 2;
  }
  
  pipeline = pipeline
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toColorspace('srgb')
    .toFormat('jpeg', { quality: 100 });
    
  if (targetWidth !== currentWidth) {
    pipeline = pipeline.resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 });
  }

  let recommendations: string[] = [];
  const stats = await sharp(inputPath).stats();
  console.log(`Stats: ${JSON.stringify(stats)}`);
  
  if (!stats.channels || stats.channels.length === 0) {
    throw new Error("Could not analyze image channels.");
  }

  const r = stats.channels[0];
  const g = stats.channels[1] || r;
  const b = stats.channels[2] || r;
  
  const avgBrightness = (r.mean + g.mean + b.mean) / 3;
  const avgContrast = (r.stdev + g.stdev + b.stdev) / 3;

  switch (mode) {
    case 'auto': {
      if (avgBrightness < 70) {
        recommendations.push("Underexposed image detected. Applying deep shadow recovery and lifting midtones.");
      } else if (avgBrightness > 190) {
        recommendations.push("Overexposed image detected. Protecting highlights and recovering lost details.");
      } else {
        recommendations.push("Good exposure detected. Applying DSLR-grade color grading and micro-contrast.");
      }

      if (avgContrast < 45) {
        recommendations.push("Low contrast detected. Boosting dynamic range for a punchier look.");
      }

      if (b.mean > r.mean + 15 && b.mean > g.mean + 15) {
        recommendations.push("Cool color cast detected. Warming up tones for natural skin and environments.");
      } else if (r.mean > b.mean + 15 && r.mean > g.mean + 15) {
        recommendations.push("Warm color cast detected. Balancing white point for accurate colors.");
      }

      recommendations.push("Applying Computational Photography: Smart HDR, lens sharpening, and subtle vignette.");

      let brightnessMultiplier = 1.0;
      let saturationMultiplier = 1.15;
      let gammaValue = 1.0; 
      let claheSlope = 1.2;

      if (avgBrightness < 70) {
        gammaValue = 1.4; 
        brightnessMultiplier = 1.1;
        claheSlope = 2.0;
      } else if (avgBrightness < 100) {
        gammaValue = 1.2; 
        brightnessMultiplier = 1.05;
        claheSlope = 1.5;
      } else if (avgBrightness > 190) {
        gammaValue = 0.9; 
        brightnessMultiplier = 0.95;
        claheSlope = 1.5;
      }

      if (avgContrast < 45) {
        claheSlope = Math.max(claheSlope, 2.5);
      }

      if (gammaValue !== 1.0) pipeline = pipeline.gamma(gammaValue);
      pipeline = pipeline.modulate({ 
        brightness: brightnessMultiplier, 
        saturation: isColorPopEnabled ? saturationMultiplier : 1.0 
      });

      if (isSmartHdrEnabled) {
        const claheWindow = Math.max(10, Math.floor(targetWidth / 8));
        pipeline = pipeline.clahe({ width: claheWindow, height: claheWindow, maxSlope: Math.round(claheSlope) });
        recommendations.push("Applied Smart HDR for dynamic shadow recovery.");
      }

      if (isColorPopEnabled) {
        pipeline = pipeline.recomb([
          [1.04, -0.02, -0.02],
          [-0.02, 1.04, -0.02],
          [-0.02, -0.02, 1.04]
        ]);
        recommendations.push("Applied Cinematic Color Pop.");
      }

      if (isFaceEnhancementEnabled) {
        pipeline = pipeline.median(1).sharpen({ sigma: 1.0, m1: 0.5, m2: 5 });
        recommendations.push("Applied AI Face Enhancement.");
      }

      pipeline = pipeline.sharpen({ sigma: 1.2, m1: 0.5, m2: 2 });

      const targetHeight = Math.round((metadata.height || 1000) * (targetWidth / (metadata.width || 1000)));
      
      let composites: sharp.OverlayOptions[] = [];

      if (isBackgroundBlurEnabled) {
        // Use JPEG for intermediate buffer to save memory and time
        const currentBuffer = await pipeline.toFormat('jpeg', { quality: 90 }).toBuffer();
        const blurredBuffer = await sharp(currentBuffer).blur(8).toBuffer();
        
        const maskSvg = `<svg width="${targetWidth}" height="${targetHeight}">
          <radialGradient id="g" cx="50%" cy="50%" r="60%">
            <stop offset="30%" stop-color="white" stop-opacity="0"/>
            <stop offset="100%" stop-color="white" stop-opacity="1"/>
          </radialGradient>
          <rect width="100%" height="100%" fill="url(#g)"/>
        </svg>`;
        
        const maskedBlur = await sharp(blurredBuffer)
          .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
          .toFormat('png') // PNG is required for alpha channel in composite
          .toBuffer();
          
        pipeline = sharp(currentBuffer);
        composites.push({ input: maskedBlur, blend: 'over' });
        recommendations.push("Applied simulated background blur (depth of field).");
      }

      const vignetteSvg = `<svg width="${targetWidth}" height="${targetHeight}"><radialGradient id="g" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="transparent"/><stop offset="100%" stop-color="black" stop-opacity="0.3"/></radialGradient><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
      composites.push({ input: Buffer.from(vignetteSvg), blend: 'multiply' });
      
      pipeline = pipeline.composite(composites);
      
      break;
    }
    
    case 'portrait':
      pipeline = pipeline
        .gamma(1.2)
        .modulate({ brightness: 1.05, saturation: 1.02 })
        .sharpen({ sigma: 0.8 });
        
      if (isFaceEnhancementEnabled) {
        pipeline = pipeline.median(1).sharpen({ sigma: 1.0, m1: 0.5, m2: 5 });
      }
      break;

    case 'portrait_blur':
      pipeline = pipeline
        .gamma(1.25)
        .modulate({ brightness: 1.08, saturation: 1.0 })
        .blur(0.5)
        .sharpen({ sigma: 1.2 });
        
      if (isFaceEnhancementEnabled) {
        pipeline = pipeline.median(1).sharpen({ sigma: 1.0, m1: 0.5, m2: 5 });
      }
      break;

    case 'bw':
      pipeline = pipeline
        .grayscale()
        .linear(1.2, -0.1)
        .sharpen({ sigma: 1.2 });
      break;

    case 'ultra_hd':
      pipeline = pipeline
        .sharpen({ sigma: 2.5 })
        .modulate({ saturation: 1.15, brightness: 1.02 });
      break;

    case 'low_light':
      pipeline = pipeline
        .median(3)
        .modulate({ brightness: 1.5, saturation: 1.2 })
        .gamma(1.2)
        .sharpen({ sigma: 1.5 });
      break;

    case 'hdr':
      pipeline = pipeline
        .modulate({ saturation: 1.4, brightness: 1.05 })
        .linear(1.15, -19.2)
        .sharpen({ sigma: 1.8 });
      break;

    case 'color_restore':
      pipeline = pipeline
        .modulate({ saturation: 1.6, brightness: 1.05 })
        .clahe({ width: 2, height: 2 })
        .sharpen({ sigma: 1.2, m1: 0.5, m2: 20 });
      break;

    default:
      pipeline = pipeline.sharpen({ sigma: 1.5, m1: 0.5, m2: 20 });
  }

  const ext = path.extname(outputPath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    await pipeline.toFormat('jpeg', { quality: 95 }).toFile(outputPath);
  } else {
    await pipeline.toFormat('png').toFile(outputPath);
  }
  return { recommendations, metadata };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Ensure directories exist - Use /tmp on serverless platforms as the filesystem is read-only
  const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
  const isCloudRun = process.env.K_SERVICE !== undefined;
  const isProduction = process.env.NODE_ENV === 'production';
  const useTmp = isVercel || isCloudRun || isProduction;
  const useBase64 = isVercel; // Only use Base64 for Vercel
  
  const baseDir = useTmp ? os.tmpdir() : process.cwd();
  const uploadsDir = path.join(baseDir, 'uploads');
  const outputsDir = path.join(baseDir, 'outputs');
  
  // Memory optimization for sharp
  sharp.cache(false);
  sharp.concurrency(1); // Reduce concurrency to save memory in constrained environments
  
  // Check for ffmpeg availability
  let ffmpegAvailable = false;
  try {
    if (fs.existsSync(ffmpegInstaller.path)) {
      // Ensure it's executable
      try {
        fs.chmodSync(ffmpegInstaller.path, 0o755);
        if (fs.existsSync(ffprobeInstaller.path)) {
          fs.chmodSync(ffprobeInstaller.path, 0o755);
        }
      } catch (e) {
        console.warn("Could not set executable permissions on ffmpeg/ffprobe:", e);
      }
      ffmpegAvailable = true;
      console.log("FFmpeg binary found at:", ffmpegInstaller.path);
    } else {
      console.warn("FFmpeg binary NOT found at:", ffmpegInstaller.path);
    }
  } catch (e) {
    console.error("Error checking ffmpeg path:", e);
  }

  // Create directories if they don't exist
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

  // Create directories on each request if they don't exist (extra safety)
  app.use((req, res, next) => {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });
    next();
  });

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Ensure directory exists before multer uses it
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 30 * 1024 * 1024 } // 30MB limit
  });

  // Serve static files from outputs
  app.use('/outputs', express.static(outputsDir));

  // API Routes
  app.post("/api/enhance", upload.single('image'), async (req, res) => {
    console.log(`Received enhancement request: ${req.file?.originalname} (${req.file?.mimetype})`);
    try {
      if (!req.file) {
        console.error("No image uploaded in request");
        return res.status(400).json({ error: "No image uploaded" });
      }

      const { 
        mode = 'auto', 
        faceEnhancement = 'true',
        backgroundBlur = 'false',
        colorPop = 'true',
        smartHdr = 'true'
      } = req.body;
      
      const isFaceEnhancementEnabled = faceEnhancement === 'true';
      const isBackgroundBlurEnabled = backgroundBlur === 'true';
      const isColorPopEnabled = colorPop === 'true';
      const isSmartHdrEnabled = smartHdr === 'true';
      
      const inputPath = req.file.path;
      
      if (req.file.mimetype.startsWith('video/')) {
        if (!ffmpegAvailable) {
          throw new Error("Video processing is currently unavailable on this environment (FFmpeg not found).");
        }

        const outputFilename = `enhanced-${uuidv4()}.mp4`;
        const outputPath = path.join(outputsDir, outputFilename);
        const tempDir = path.join(outputsDir, `temp-${uuidv4()}`);
        fs.mkdirSync(tempDir);

        try {
          // Extract frames
          console.log("Extracting frames...");
          await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
              .outputOptions(['-qscale:v 4']) // Slightly lower quality for faster extraction
              .output(path.join(tempDir, 'frame-%04d.jpg'))
              .on('end', resolve)
              .on('error', (err) => {
                console.error("FFmpeg extraction error:", err);
                reject(new Error(`Frame extraction failed: ${err.message}`));
              })
              .run();
          });

          // Process frames
          const files = fs.readdirSync(tempDir).filter(f => f.startsWith('frame-'));
          console.log(`Processing ${files.length} frames...`);
          
          // On Vercel, limit frames to avoid timeout
          const maxFrames = isVercel ? 30 : 300;
          const framesToProcess = files.slice(0, maxFrames);
          if (files.length > maxFrames) {
            console.warn(`Video too long for Vercel. Truncating to ${maxFrames} frames.`);
          }

          const limit = pLimit(isVercel ? 1 : 2); // Even stricter on Vercel
          let recommendations: string[] = [];
          let metadata: any = {};

          await Promise.all(framesToProcess.map(file => limit(async () => {
            const frameInput = path.join(tempDir, file);
            const frameOutput = path.join(tempDir, `out-${file}`);
            const res = await processImagePipeline(frameInput, frameOutput, mode, {
              isFaceEnhancementEnabled,
              isBackgroundBlurEnabled,
              isColorPopEnabled,
              isSmartHdrEnabled
            });
            if (file === framesToProcess[0]) {
              recommendations = res.recommendations;
              metadata = res.metadata;
            }
          })));

          // Get framerate of original video to match output
          const fps = await new Promise((resolve) => {
            ffmpeg.ffprobe(inputPath, (err, probeData) => {
              if (err) {
                console.warn("FFprobe failed, using default 30fps:", err);
                resolve(30);
                return;
              }
              const videoStream = probeData?.streams?.find(s => s.codec_type === 'video');
              if (videoStream && videoStream.r_frame_rate) {
                const [num, den] = videoStream.r_frame_rate.split('/');
                resolve(parseInt(num) / parseInt(den));
              } else {
                resolve(30);
              }
            });
          });

          // Re-encode video
          console.log("Re-encoding video...");
          await new Promise((resolve, reject) => {
            ffmpeg()
              .input(path.join(tempDir, 'out-frame-%04d.jpg'))
              .inputFPS(fps as number)
              .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-crf 28', // Higher CRF for smaller file size on Vercel
                '-preset ultrafast'
              ])
              .output(outputPath)
              .on('end', resolve)
              .on('error', (err) => {
                console.error("FFmpeg encoding error:", err);
                reject(new Error(`Video encoding failed: ${err.message}`));
              })
              .run();
          });

          // Check size for Vercel
          if (useBase64) {
            const stats = fs.statSync(outputPath);
            if (stats.size > 4 * 1024 * 1024) {
              throw new Error(`Enhanced video is too large for Vercel (${(stats.size / 1024 / 1024).toFixed(2)}MB). Max allowed is ~3.3MB raw.`);
            }
          }

          res.json({
            success: true,
            enhancedImageUrl: useBase64
              ? `data:video/mp4;base64,${fs.readFileSync(outputPath).toString('base64')}`
              : `/outputs/${outputFilename}`,
            recommendations: [...recommendations, isVercel && files.length > maxFrames ? "Note: Video was truncated due to Vercel execution limits." : ""].filter(Boolean),
            metadata: {
              ...metadata,
              format: 'mp4'
            }
          });
        } finally {
          // Cleanup temp dir
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
          // Cleanup output file if we sent it as base64
          if (useBase64 && fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        }
      } else {
        const outputFilename = `enhanced-${uuidv4()}.jpg`;
        const outputPath = path.join(outputsDir, outputFilename);

        let { recommendations, metadata } = await processImagePipeline(inputPath, outputPath, mode, {
          isFaceEnhancementEnabled,
          isBackgroundBlurEnabled,
          isColorPopEnabled,
          isSmartHdrEnabled
        });

        // If on Vercel, ensure the Base64 response stays under the 4.5MB limit
        if (useBase64) {
          let stats = fs.statSync(outputPath);
          // Vercel limit is 4.5MB, but Base64 adds ~33% overhead. 
          // 3MB raw file -> ~4MB Base64. Let's target 3MB.
          if (stats.size > 3 * 1024 * 1024) {
            console.log(`Image too large for Vercel (${(stats.size / 1024 / 1024).toFixed(2)}MB). Performing aggressive re-compression...`);
            // Try 60% quality first
            await sharp(outputPath)
              .jpeg({ quality: 60, mozjpeg: true })
              .toFile(outputPath + '.tmp');
            
            let newStats = fs.statSync(outputPath + '.tmp');
            if (newStats.size > 3.5 * 1024 * 1024) {
              // Still too large? Go even lower.
              console.log(`Still too large (${(newStats.size / 1024 / 1024).toFixed(2)}MB). Dropping to 40% quality.`);
              await sharp(outputPath)
                .jpeg({ quality: 40, mozjpeg: true })
                .toFile(outputPath + '.tmp2');
              fs.renameSync(outputPath + '.tmp2', outputPath + '.tmp');
            }
            
            fs.renameSync(outputPath + '.tmp', outputPath);
            
            // Final check
            let finalStats = fs.statSync(outputPath);
            if (finalStats.size > 4 * 1024 * 1024) {
              throw new Error(`Enhanced image is too large for Vercel (${(finalStats.size / 1024 / 1024).toFixed(2)}MB). Please try a smaller image.`);
            }
          }
        }

        const responseData = {
          success: true,
          enhancedImageUrl: useBase64 
            ? `data:image/jpeg;base64,${fs.readFileSync(outputPath).toString('base64')}`
            : `/outputs/${outputFilename}`,
          recommendations,
          metadata: {
            originalWidth: metadata.width,
            originalHeight: metadata.height,
            mode: mode,
            format: 'jpeg'
          }
        };

        // Cleanup files
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (useBase64 && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        res.json(responseData);
      }

    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        mode: req.body?.mode,
        inputPath: req.file?.path
      };
      console.error("Enhancement error details:", errorDetails);
      
      // Cleanup input file on error
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          console.error("Failed to cleanup input file on error:", e);
        }
      }

      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return { app, PORT };
}

const { app, PORT } = await startServer();

// Export the app for Vercel
export default app;

// Start the server if not being imported as a module
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
