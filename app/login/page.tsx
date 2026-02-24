import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginUser } from './actions'

export const metadata = {
  title: 'Log In | DataOmen',
  description: 'Log in to your autonomous data workspace.',
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mx-auto flex w-full max-w-[350px] flex-col justify-center space-y-6">
        
        {/* Header */}
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">DataOmen</h1>
          <p className="text-sm text-muted-foreground">Welcome back.</p>
        </div>

        <div className="grid gap-6">
          {/* Phase 1 Placeholder: OAuth Button */}
          <Button variant="outline" type="button" className="w-full">
            <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
              <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
            </svg>
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or login with email
              </span>
            </div>
          </div>

          {/* Form strictly bound to our existing server action */}
          <form action={loginUser}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email" className="sr-only">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Email"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="sr-only">Password</Label>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Password"
                  required
                  autoComplete="current-password"
                />
                <div className="flex justify-start mt-1">
                  <Link href="/forgot-password" className="text-xs font-medium text-muted-foreground hover:text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </div>
              <Button className="w-full mt-2" type="submit">
                Log In
              </Button>
            </div>
          </form>
        </div>

        {/* Footer Link */}
        <p className="text-center text-sm text-muted-foreground">
          Don't have a workspace yet?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}