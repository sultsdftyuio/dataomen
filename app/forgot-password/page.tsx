import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPassword } from './actions'

export const metadata = {
  title: 'Reset Password | DataOmen',
  description: 'Recover access to your autonomous data workspace.',
}

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mx-auto flex w-full max-w-[350px] flex-col justify-center space-y-6">
        
        {/* Header */}
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Reset Password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email address and we will send you a secure recovery link.
          </p>
        </div>

        <div className="grid gap-6">
          {/* Form strictly bound to our existing server action */}
          <form action={resetPassword}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email" className="sr-only">Work Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                />
              </div>
              <Button className="w-full mt-2" type="submit">
                Send Recovery Link
              </Button>
            </div>
          </form>
        </div>

        {/* Footer Link */}
        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}