'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import axios from 'axios'

interface Clone {
  userId: string
  username: string
  name?: string
  bio?: string
  createdAt: string
  isPublic: boolean
}

interface CloneBrowserProps {
  currentUserId: string
  onSelectClone: (userId: string) => void
}

export default function CloneBrowser({ currentUserId, onSelectClone }: CloneBrowserProps) {
  const [clones, setClones] = useState<Clone[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadClones()
  }, [])

  const loadClones = async () => {
    try {
      // For admin bypass, show mock clones
      const isAdminBypass = localStorage.getItem('adminBypass') === 'true'
      
      if (isAdminBypass) {
        setClones([
          {
            userId: 'user_1',
            username: 'techie_sam',
            name: 'Sam Chen',
            bio: 'Software engineer who loves AI and gaming',
            createdAt: new Date().toISOString(),
            isPublic: true
          },
          {
            userId: 'user_2',
            username: 'artist_maya',
            name: 'Maya Rodriguez',
            bio: 'Digital artist and creative thinker',
            createdAt: new Date().toISOString(),
            isPublic: true
          },
          {
            userId: 'user_3',
            username: 'gamer_alex',
            name: 'Alex Johnson',
            bio: 'Minecraft modder and game developer',
            createdAt: new Date().toISOString(),
            isPublic: true
          }
        ])
        setLoading(false)
        return
      }

      const response = await axios.get('/api/clones')
      setClones(response.data.clones || [])
    } catch (error) {
      console.error('Error loading clones:', error)
      setClones([])
    } finally {
      setLoading(false)
    }
  }

  const filteredClones = clones.filter(clone => 
    clone.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    clone.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">Browse AI Clones</h1>
        <p className="text-gray-400 text-lg">
          Discover and chat with other people's AI clones
        </p>
      </div>

      {/* Search */}
      <div className="max-w-2xl mx-auto">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username or name..."
            className="w-full px-6 py-4 bg-dark-surface border border-white/30 rounded-xl
                     text-white text-lg focus:border-white focus:outline-none
                     placeholder-gray-500"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
            🔍
          </div>
        </div>
      </div>

      {/* Clone Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClones.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-gray-400 text-lg">
              {searchQuery ? 'No clones found matching your search' : 'No public clones available yet'}
            </p>
          </div>
        ) : (
          filteredClones.map((clone) => (
            <motion.div
              key={clone.userId}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => onSelectClone(clone.userId)}
              className="bg-dark-surface rounded-xl p-6 border border-white/20
                       hover:border-white/40 cursor-pointer transition-all glow-border"
            >
              {/* Avatar */}
              <div className="w-20 h-20 bg-gradient-to-br from-white/20 to-white/5 
                            rounded-full flex items-center justify-center mb-4 mx-auto">
                <span className="text-3xl">👤</span>
              </div>

              {/* Info */}
              <div className="text-center">
                <h3 className="text-xl font-bold text-white mb-1">
                  {clone.name || clone.username}
                </h3>
                <p className="text-sm text-gray-400 mb-3">
                  @{clone.username}
                </p>
                {clone.bio && (
                  <p className="text-sm text-gray-300 mb-4 line-clamp-2">
                    {clone.bio}
                  </p>
                )}
                <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                  <span>Created {new Date(clone.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Action */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <button className="w-full py-2 bg-white/10 hover:bg-white/20 
                                 text-white font-medium rounded-lg transition-colors">
                  Chat with Clone
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}

