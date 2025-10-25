'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { useFaceMesh } from '@/lib/hooks/useFaceMesh'
import { applyMediapipeToMockFace } from '@/lib/applyMediapipeToMock'

interface UploaderProps {
  audioBlob: Blob
  userId: string
  voiceTraining: {
    isTraining: boolean
    progress: number
    status: string
  }
  onComplete: (userId: string) => void
}

const PHOTO_LABELS = ['Front', 'Left', 'Right', 'Up', 'Down']

export default function Uploader({ audioBlob, userId, voiceTraining, onComplete }: UploaderProps) {
  const [photos, setPhotos] = useState<(File | null)[]>([null, null, null, null, null])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processingFace, setProcessingFace] = useState(false)
  const [contexts, setContexts] = useState({
    story: '',
    habit: '',
    reaction: ''
  })
  const [captureMode, setCaptureMode] = useState(false)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  
  const { processFaceImages, isLoading: isFaceMeshLoading, isReady } = useFaceMesh()

  const startCamera = async () => {
    console.log('🎥 Starting camera...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } 
      })
      
      console.log('✅ Camera stream obtained:', stream)
      streamRef.current = stream
      setCaptureMode(true)
      setCurrentPhotoIndex(0)
      
      // Set video source after state update
      setTimeout(() => {
        if (videoRef.current && stream) {
          console.log('🎬 Setting video source...')
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(e => console.error('Video play error:', e))
        }
      }, 100)
    } catch (error) {
      console.error('❌ Camera error:', error)
      alert('Please allow camera access to take selfies.')
    }
  }

  const capturePhoto = () => {
    console.log('📸 Capturing photo', currentPhotoIndex + 1)
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const video = videoRef.current
      
      // Check if video is ready
      if (video.readyState < 2) {
        console.warn('⚠️ Video not ready yet')
        alert('Video is loading, please wait a moment...')
        return
      }
      
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // Flip horizontally to match the mirrored preview
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(video, 0, 0)
        
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('✅ Photo captured successfully')
            const file = new File([blob], `photo-${currentPhotoIndex}.jpg`, { type: 'image/jpeg' })
            const newPhotos = [...photos]
            newPhotos[currentPhotoIndex] = file
            setPhotos(newPhotos)
            
            // Move to next photo or finish
            if (currentPhotoIndex < 4) {
              console.log('➡️ Moving to next photo:', currentPhotoIndex + 2)
              setCurrentPhotoIndex(currentPhotoIndex + 1)
            } else {
              console.log('🎉 All photos captured!')
              stopCamera()
            }
          }
        }, 'image/jpeg', 0.9)
      }
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
      setCaptureMode(false)
      setCurrentPhotoIndex(0)
    }
  }

  const handleFileUpload = (index: number, file: File) => {
    const newPhotos = [...photos]
    newPhotos[index] = file
    setPhotos(newPhotos)
  }

  const handleSubmit = async () => {
    // Validate
    if (photos.some(p => !p)) {
      alert('Please capture or upload all 5 photos')
      return
    }

    setUploading(true)
    setProcessingFace(true)
    setProgress(0)

    try {
      console.log('🎭 Step 1: Extracting face landmarks with MediaPipe...')
      console.log(`   Processing ${photos.filter(p => p !== null).length} photos`)
      console.log(`   FaceMesh hook ready: ${isReady}`)
      console.log(`   FaceMesh hook loading: ${isFaceMeshLoading}`)
      
      // Check if MediaPipe is ready
      if (!isReady) {
        console.error('❌ MediaPipe is not loaded yet!')
        alert('Face detection system is still loading. Please wait a moment and try again.')
        throw new Error('MediaPipe not ready')
      }
      
      // Extract face landmarks from photos using MediaPipe
      const validPhotos = photos.filter(p => p !== null) as File[]
      console.log('   Calling processFaceImages with', validPhotos.length, 'photos...')
      
      const mediapipeResult = await processFaceImages(validPhotos)
      
      console.log('   processFaceImages returned:', mediapipeResult ? 'SUCCESS' : 'NULL')
      
      if (!mediapipeResult) {
        console.error('❌ MediaPipe failed - no result returned')
        alert('Could not detect your face in the photos. Please:\n1. Make sure your face is clearly visible\n2. Use well-lit photos\n3. Face the camera directly')
        throw new Error('MediaPipe face detection failed')
      }

      const { landmarks, contours } = mediapipeResult

      console.log('✅ Face landmarks extracted!')
      console.log(`   Detected ${landmarks ? landmarks.length : 'NO'} raw MediaPipe landmarks`)
      console.log(`   Generated ${contours ? contours.length : 'NO'} contours from ${validPhotos.length} photos`)
      
      if (!landmarks || landmarks.length < 468) {
        console.error(`❌ Invalid MediaPipe data - expected 468 landmarks, got ${landmarks?.length || 0}`)
        alert('Face detection incomplete. Please try again with clearer photos.')
        throw new Error('Invalid MediaPipe landmarks')
      }
      
      console.log('   Sample landmark (point 10):', landmarks[10])
      console.log('   Sample landmark (point 151):', landmarks[151])
      
      console.log('🎨 Step 2: Applying real proportions to 2.5D face template...')
      
      // Fetch the mock face template
      const mockResponse = await fetch('/api/mock-face')
      const { contours: mockFaceContours } = await mockResponse.json()
      console.log(`   Fetched ${mockFaceContours.length} mock face contours`)
      
      // CRITICAL DEBUG: Check landmarks before applying
      console.log('📋 BEFORE applying to mock:')
      console.log(`   Raw landmarks count: ${landmarks.length}`)
      console.log(`   Landmark 10 (forehead):`, landmarks[10])
      console.log(`   Landmark 151 (top head):`, landmarks[151])
      console.log(`   Landmark 133 (left eye):`, landmarks[133])
      console.log(`   Landmark 362 (right eye):`, landmarks[362])
      
      // Apply MediaPipe measurements to mock face structure (using RAW landmarks!)
      console.log('   🔄 Calling applyMediapipeToMockFace...')
      
      let personalizedFace
      try {
        personalizedFace = applyMediapipeToMockFace(landmarks, mockFaceContours)
        console.log('   ✅ applyMediapipeToMockFace completed without errors')
      } catch (error) {
        console.error('   ❌ applyMediapipeToMockFace FAILED:', error)
        console.error('   Error stack:', (error as Error).stack)
        throw error
      }
      
      console.log('📋 AFTER applying to mock:')
      console.log(`   Output: ${personalizedFace.length} contours`)
      
      const jawline = personalizedFace.find(c => c.name === 'jawline')
      const leftEye = personalizedFace.find(c => c.name === 'left_eye_outline')
      const hairFront = personalizedFace.find(c => c.name === 'hair_front')
      
      if (jawline) {
        const jawWidth = Math.max(...jawline.points.map(p => Math.abs(p[0]))) * 2
        console.log(`   Jawline width: ${jawWidth.toFixed(3)} (should NOT be 0.700 for everyone!)`)
        console.log(`   Sample jaw point:`, jawline.points[0])
      }
      
      if (leftEye) {
        console.log(`   Left eye position:`, leftEye.points[0])
      }
      
      if (hairFront) {
        const topHairY = Math.max(...hairFront.points.map(p => p[1]))
        console.log(`   Top hair Y: ${topHairY.toFixed(3)} (higher = spikier)`)
      }
      
      console.log('✅ Created personalized 2.5D face model!')
      
      setProcessingFace(false)
      setProgress(50)

      console.log('📤 Step 3: Uploading face data and contexts...')

      // Send personalized face contours and contexts to API
      const response = await axios.post('/api/update-user', {
        userId,
        faceContours: personalizedFace,
        contexts
      }, {
        headers: { 'Content-Type': 'application/json' }
      })

      console.log('✅ Face model and context uploaded!')
      setProgress(100)
      
      // Brief pause to show completion, then proceed
      setTimeout(() => {
        setUploading(false)
        onComplete(userId)
      }, 800)
    } catch (error: any) {
      console.error('❌ Upload error:', error)
      console.error('   Error response:', error.response?.data)
      console.error('   Error status:', error.response?.status)
      alert(`Failed to process: ${error.response?.data?.error || error.message}. Please try again.`)
      setUploading(false)
      setProcessingFace(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Photo Capture Section */}
      <div className="bg-dark-surface rounded-lg p-8 glow-border">
        {!captureMode ? (
          /* Initial State - Show Start Button */
          <div className="text-center space-y-6">
            <h2 className="text-3xl font-bold text-white mb-4">
              Capture 5 Selfies
            </h2>
            <p className="text-gray-400 mb-4">
              We'll guide you through capturing 5 photos from different angles
            </p>
            
            {/* Consent Notice */}
            <div className="bg-dark-bg border border-white/20 rounded-lg p-4 mb-6 text-left max-w-2xl mx-auto">
              <p className="text-xs text-gray-300 leading-relaxed mb-2">
                <strong className="text-white">Consent:</strong> You have my full, explicit consent to generate a 3D model of my own face 
                using the images I provided. These images are of me, and I authorize their 
                use for this modeling purpose only.
              </p>
              <p className="text-xs text-gray-400 leading-relaxed">
                The uploaded photos were taken by me and depict myself. 
                No third parties are involved or affected.
              </p>
            </div>
            
            {/* Preview of captured photos */}
            <div className="grid grid-cols-5 gap-4 mb-8">
              {PHOTO_LABELS.map((label, idx) => (
                <div key={idx} className="text-center">
                  <div className="aspect-square bg-dark-bg rounded-lg border-2 border-dark-border 
                                flex items-center justify-center mb-2 overflow-hidden">
                    {photos[idx] ? (
                      <img
                        src={URL.createObjectURL(photos[idx]!)}
                        alt={label}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startCamera}
              className="px-12 py-6 bg-transparent border-2 border-white text-white font-bold text-2xl rounded-xl
                       hover:bg-white hover:text-black transition-colors"
            >
              📷 Start Taking Photos
            </motion.button>
          </div>
        ) : (
          /* Camera Mode - Single sliding view */
          <div className="space-y-6">
            {/* Header with progress */}
            <motion.div 
              key={`header-${currentPhotoIndex}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <div className="flex items-center justify-center gap-2 mb-4">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <div
                    key={idx}
                    className={`h-2 rounded-full transition-all ${
                      idx < currentPhotoIndex
                        ? 'w-8 bg-green-500'
                        : idx === currentPhotoIndex
                        ? 'w-12 bg-white'
                        : 'w-8 bg-gray-700'
                    }`}
                  />
                ))}
              </div>
              <h2 className="text-4xl font-bold text-white mb-2">
                {PHOTO_LABELS[currentPhotoIndex]} View
              </h2>
              <p className="text-lg text-gray-400">
                Photo {currentPhotoIndex + 1} of 5
              </p>
            </motion.div>

            {/* Video Preview - LARGE AND PROMINENT */}
            <div className="relative bg-black rounded-2xl overflow-hidden border-4 border-white 
                          shadow-2xl shadow-white/20 min-h-[500px]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full"
                style={{ 
                  minHeight: '500px',
                  objectFit: 'cover',
                  display: 'block',
                  transform: 'scaleX(-1)' // Mirror flip for natural selfie view
                }}
                onLoadedMetadata={() => console.log('📹 Video metadata loaded')}
                onPlay={() => console.log('▶️ Video playing')}
              />
              
              {/* Face guide overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-80 border-4 border-white rounded-full opacity-30 animate-pulse" />
              </div>
              
              {/* Direction instruction - BIG AND CLEAR */}
              <motion.div 
                key={`instruction-${currentPhotoIndex}`}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute top-8 left-1/2 -translate-x-1/2 bg-white text-black 
                          px-8 py-4 rounded-full font-bold text-xl shadow-lg"
              >
                {PHOTO_LABELS[currentPhotoIndex] === 'Front' && '👤 Look straight ahead'}
                {PHOTO_LABELS[currentPhotoIndex] === 'Left' && '👈 Turn LEFT'}
                {PHOTO_LABELS[currentPhotoIndex] === 'Right' && '👉 Turn RIGHT'}
                {PHOTO_LABELS[currentPhotoIndex] === 'Up' && '👆 Look UP'}
                {PHOTO_LABELS[currentPhotoIndex] === 'Down' && '👇 Look DOWN'}
              </motion.div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-center items-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={stopCamera}
                className="px-6 py-4 bg-transparent border-2 border-gray-500 text-gray-300 font-bold text-lg rounded-xl 
                         hover:bg-gray-500 hover:text-white transition-colors"
              >
                ✕ Cancel
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={capturePhoto}
                className="w-20 h-20 bg-white rounded-full flex items-center justify-center
                         shadow-2xl shadow-white/30 hover:bg-gray-200 transition-all
                         border-4 border-gray-300"
                title="Take Photo"
              >
                <div className="w-16 h-16 bg-gray-800 rounded-full" />
              </motion.button>
            </div>
          </div>
        )}
      </div>

      {/* Context Input Section */}
      <div className="bg-dark-surface rounded-lg p-8 glow-border">
        <h2 className="text-3xl font-bold text-white mb-6">
          Share Your Context
        </h2>
        <p className="text-gray-400 mb-6">
          Help your clone understand you better by sharing stories, habits, and reactions.
        </p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Tell a story about yourself
            </label>
            <textarea
              value={contexts.story}
              onChange={(e) => setContexts({ ...contexts, story: e.target.value })}
              rows={3}
              className="w-full bg-dark-bg border border-white/30 rounded-lg p-3 
                       text-white focus:border-white focus:outline-none"
              placeholder="e.g., I grew up in a small town and always loved technology..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Describe a daily habit
            </label>
            <textarea
              value={contexts.habit}
              onChange={(e) => setContexts({ ...contexts, habit: e.target.value })}
              rows={3}
              className="w-full bg-dark-bg border border-white/30 rounded-lg p-3 
                       text-white focus:border-white focus:outline-none"
              placeholder="e.g., Every morning I drink coffee and read tech news..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              How do you typically react to challenges?
            </label>
            <textarea
              value={contexts.reaction}
              onChange={(e) => setContexts({ ...contexts, reaction: e.target.value })}
              rows={3}
              className="w-full bg-dark-bg border border-white/30 rounded-lg p-3 
                       text-white focus:border-white focus:outline-none"
              placeholder="e.g., I stay calm and break problems into smaller pieces..."
            />
          </div>
        </div>
      </div>

      {/* Fixed Progress Bar - Bottom Right Corner */}
      <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed bottom-8 right-8 z-50 bg-dark-card border border-white/30 rounded-xl p-6 shadow-2xl w-96"
      >
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span>🎤</span>
          <span>Voice Training</span>
        </h3>
        
        {/* Voice Training Progress */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-white font-medium">{voiceTraining.status}</span>
            <span className="text-white font-bold">{Math.round(voiceTraining.progress)}%</span>
          </div>
          <div className="w-full h-4 bg-dark-bg rounded-full overflow-hidden border border-white/30">
            <motion.div
              className="h-full bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${voiceTraining.progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-400 text-center">
            {voiceTraining.progress === 100
              ? "✅ Voice model ready! Continue with photos below."
              : "Training your custom S1 voice model..."}
          </p>
        </div>
      </motion.div>

      {/* Submit Button - Below progress bar */}
      <div className="flex flex-col items-center mt-6 space-y-4">
        {/* Consent Confirmation */}
        <div className="bg-dark-bg border border-white/20 rounded-lg p-4 max-w-2xl text-center">
          <p className="text-xs text-gray-300 leading-relaxed mb-2">
            <strong className="text-white">By continuing, you confirm:</strong> You have my full, explicit consent to generate a 3D model of my own face 
            using the images I provided. These images are of me, and I authorize their 
            use for this modeling purpose only.
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            The uploaded photos were taken by me and depict myself. 
            No third parties are involved or affected.
          </p>
        </div>
        
        <motion.button
          whileHover={{ scale: uploading ? 1 : 1.05 }}
          whileTap={{ scale: uploading ? 1 : 0.95 }}
          onClick={handleSubmit}
          disabled={photos.some(p => !p) || uploading}
          className="px-12 py-4 bg-transparent border-2 border-white text-white font-bold text-lg rounded-lg 
                   hover:bg-white hover:text-black transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processingFace ? '🎭 Analyzing Your Face...' : (uploading ? '📤 Uploading...' : 'I Consent - Create My Clone')}
        </motion.button>
      </div>

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

