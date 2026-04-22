import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/config/supabase'

// ── Extended user type that merges auth + profile ──
interface AppUser extends User {
  display_name?: string
  photo_url?: string
  coins?: number
  bio?: string
  username?: string
  is_verified?: boolean
  is_premium?: boolean
  creator_tier?: string
  coin_balance?: number
  followers_count?: number
  following_count?: number
  cover_url?: string
  is_admin?: boolean
  can_withdraw?: boolean
  referral_code?: string
  wallet_balance?: number
  total_earned?: number
}

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshProfile: async () => {},
})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAndMergeProfile = async (authUser: User): Promise<AppUser> => {
    const { data: profile } = await supabase
      .from('users')
      .select('display_name, photo_url, coins, bio, username')
      .eq('id', authUser.id)
      .single()

    return { ...authUser, ...(profile ?? {}) }
  }

  const refreshProfile = async () => {
    if (!user) return
    const merged = await fetchAndMergeProfile(user)
    setUser(merged)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const merged = await fetchAndMergeProfile(session.user)
        setUser(merged)
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const merged = await fetchAndMergeProfile(session.user)
          setUser(merged)
        } else {
          setUser(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
