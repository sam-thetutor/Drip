"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ConnectButton } from "@/components/connect-button"
import { WalletButton } from "@/components/wallet-button"

const navLinks = [
  { name: "Home", href: "/" },
  { name: "Streams", href: "/streams" },
  { name: "Subscriptions", href: "/subscriptions" },
]

export function Navbar() {
  const pathname = usePathname()
  
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {/* Mobile menu button */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 glass-card border-border/50">
              <div className="flex items-center gap-2 mb-8">
                <span className="font-bold text-lg text-indigo">
                  Drip
                </span>
              </div>
              <nav className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 text-base font-medium transition-all hover:text-indigo ${
                      pathname === link.href ? "text-indigo" : "text-foreground/70"
                    }`}
                  >
                    {link.name}
                  </Link>
                ))}
                <div className="mt-6 pt-6 border-t">
                  <div className="space-y-2">
                    <WalletButton className="w-full" />
                    <ConnectButton />
                  </div>
                </div>
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity group">
            <span className="hidden font-bold text-xl sm:inline-block text-indigo group-hover:scale-105 transition-transform">
              Drip
            </span>
          </Link>
        </div>
        
        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
                    href={link.href}
                    className={`flex items-center gap-1.5 text-sm font-medium transition-all hover:text-indigo hover:scale-105 ${
                      pathname === link.href
                        ? "text-indigo"
                        : "text-foreground/70"
                    }`}
                  >
                    {link.name}
                  </Link>
          ))}
          
          <div className="flex items-center gap-3">
            <WalletButton />
            <ConnectButton />
          </div>
        </nav>
      </div>
    </header>
  )
}
