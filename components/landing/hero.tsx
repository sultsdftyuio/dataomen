import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BarChart3 } from "lucide-react"

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background pt-24 md:pt-32 lg:pt-40 pb-16 md:pb-24 lg:pb-32">
      {/* Optional: Subtle background gradient for visual depth */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/20 via-background to-background dark:from-blue-900/20" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 text-center">
        {/* Small badge above the header */}
        <div className="mx-auto mb-6 flex max-w-fit items-center justify-center space-x-2 overflow-hidden rounded-full border border-border bg-background px-3 py-1 shadow-sm">
          <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-500" />
          <p className="text-sm font-medium text-foreground">
            The New Standard for Data Analytics
          </p>
        </div>

        {/* Main Headline */}
        <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
          Stop pulling data. <br className="hidden sm:block" />
          <span className="text-blue-600 dark:text-blue-500">
            Start pushing insights.
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
          DataOmen is your autonomous AI Data Analyst. Upload your raw CSVs, and let our engine proactively monitor your metrics and push alerts before anomalies become disasters.
        </p>

        {/* Call to Action Buttons */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row gap-x-6">
          <Link href="/login">
            <Button size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
              Get Started <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="#how-it-works">
            <Button variant="outline" size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
              How it Works
            </Button>
          </Link>
        </div>

        {/* Social Proof / Trust indicator (Optional) */}
        <div className="mt-16 border-t border-border pt-8 sm:mt-20 lg:mt-24">
          <p className="text-sm font-medium text-muted-foreground">
            Built for modern CFOs, data teams, and forward-thinking founders.
          </p>
        </div>
      </div>
    </section>
  )
}