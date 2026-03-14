'use client'

import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { Moon, Sun, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * Updated Navbar with "The Prism" Logo
 * Path: components/landing/navbar.tsx
 */
export function Navbar() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-border bg-background/80 backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        
        {/* Logo - Style 2: The Prism (Navy Infrastructure Series) */}
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-90">
          <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-full w-full text-blue-600 drop-shadow-[0_0_8px_rgba(37,99,235,0.3)]"
            >
              {/* Hexagonal Frame representing Data Containers */}
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              
              {/* Internal Facets representing Columnar Partitioning */}
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" className="opacity-80" />
              <line x1="12" y1="22.08" x2="12" y2="12" className="opacity-80" />
            </svg>
          </div>
          
          {/* Typography: Bold, Uppercase, Navy Accent */}
          <span className="text-xl font-black uppercase tracking-tight text-foreground">
            Data<span className="text-blue-600">Omen</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden items-center gap-1 md:flex">
          {['Features', 'How it Works', 'Pricing'].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/ /g, '-')}`}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item}
            </a>
          ))}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-2">
          {mounted && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}
          
          {/* Desktop Auth Buttons */}
          <div className="hidden items-center gap-2 md:flex">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Log In
              </Button>
            </Link>
            <Link href="/login">
              <Button size="sm">
                Sign Up
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Toggle Button */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="border-b border-border bg-background px-6 pb-4 md:hidden">
          <div className="flex flex-col gap-1">
            {['Features', 'How it Works', 'Pricing'].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/ /g, '-')}`}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {item}
              </a>
            ))}
            
            {/* Mobile Auth Buttons */}
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/login" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" className="w-full justify-center">
                  Log In
                </Button>
              </Link>
              <Link href="/login" onClick={() => setMobileOpen(false)}>
                <Button className="w-full justify-center">
                  Sign Up
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}