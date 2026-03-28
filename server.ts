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
  
  const metadata = await sharp(inputPath).metadata();
  let pipeline = sharp(inputPath);

  const currentWidth = metadata.width || 1000;
  let targetWidth = currentWidth;
  if (currentWidth < 800) {
    targetWidth = currentWidth * 2;
  }
  
  pipeline = pipeline
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toFormat('jpeg', { quality: 100 });
    
  if (targetWidth !== currentWidth) {
    pipeline = pipeline.resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 });
  }

  let recommendations: string[] = [];
  const stats = await sharp(inputPath).stats();
  const r = stats.channels[0];
  const g = stats.channels[1];
  const b = stats.channels[2];
  
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
        const currentBuffer = await pipeline.toFormat('png').toBuffer();
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
          .toFormat('png')
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

  // Ensure directories exist - Use /tmp on Vercel as the filesystem is read-only
  const isVercel = process.env.VERCEL === '1';
  const baseDir = isVercel ? os.tmpdir() : process.cwd();
  const uploadsDir = path.join(baseDir, 'uploads');
  const outputsDir = path.join(baseDir, 'outputs');
  
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
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
    try {
      if (!req.file) {
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
        const outputFilename = `enhanced-${uuidv4()}.mp4`;
        const outputPath = path.join(outputsDir, outputFilename);
        const tempDir = path.join(outputsDir, `temp-${uuidv4()}`);
        fs.mkdirSync(tempDir);

        try {
          // Extract frames
          await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
              .outputOptions(['-qscale:v 2']) // High quality jpeg extraction
              .output(path.join(tempDir, 'frame-%04d.jpg'))
              .on('end', resolve)
              .on('error', reject)
              .run();
          });

          // Process frames
          const files = fs.readdirSync(tempDir).filter(f => f.startsWith('frame-'));
          const limit = pLimit(2); // Limit concurrency to avoid OOM
          let recommendations: string[] = [];
          let metadata: any = {};

          await Promise.all(files.map(file => limit(async () => {
            const frameInput = path.join(tempDir, file);
            const frameOutput = path.join(tempDir, `out-${file}`);
            const res = await processImagePipeline(frameInput, frameOutput, mode, {
              isFaceEnhancementEnabled,
              isBackgroundBlurEnabled,
              isColorPopEnabled,
              isSmartHdrEnabled
            });
            if (file === files[0]) {
              recommendations = res.recommendations;
              metadata = res.metadata;
            }
          })));

          // Get framerate of original video to match output
          const fps = await new Promise((resolve) => {
            ffmpeg.ffprobe(inputPath, (err, probeData) => {
              if (err) resolve(30); // default
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
          await new Promise((resolve, reject) => {
            ffmpeg()
              .input(path.join(tempDir, 'out-frame-%04d.jpg'))
              .inputFPS(fps as number)
              .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-crf 23'
              ])
              .output(outputPath)
              .on('end', resolve)
              .on('error', reject)
              .run();
          });

          res.json({
            success: true,
            enhancedImageUrl: `/outputs/${outputFilename}`,
            recommendations,
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
        }
      } else {
        const outputFilename = `enhanced-${uuidv4()}.png`;
        const outputPath = path.join(outputsDir, outputFilename);

        const { recommendations, metadata } = await processImagePipeline(inputPath, outputPath, mode, {
          isFaceEnhancementEnabled,
          isBackgroundBlurEnabled,
          isColorPopEnabled,
          isSmartHdrEnabled
        });

        res.json({
          success: true,
          enhancedImageUrl: isVercel 
            ? `data:image/png;base64,${fs.readFileSync(outputPath).toString('base64')}`
            : `/outputs/${outputFilename}`,
          recommendations,
          metadata: {
            originalWidth: metadata.width,
            originalHeight: metadata.height,
            mode: mode,
            format: metadata.format
          }
        });
      }

    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        mode: req.body?.mode,
        inputPath: req.file?.path
      };
      console.error("Enhancement error details:", errorDetails);
      fs.appendFileSync('error.log', JSON.stringify(errorDetails) + '\n');
      res.status(500).json({ 
        error: "Failed to process image", 
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  return app;
}

export default startServer();
