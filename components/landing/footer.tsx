export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none" className="text-primary-foreground">
              <path d="M7 1L13 4V10L7 13L1 10V4L7 1Z" fill="currentColor" fillOpacity="0.3" />
              <path d="M7 1L13 4L7 7L1 4L7 1Z" fill="currentColor" />
              <path d="M7 7V13L1 10V4L7 7Z" fill="currentColor" fillOpacity="0.7" />
            </svg>
          </div>
          <span className="text-sm text-muted-foreground">
            DataOmen &copy; {new Date().getFullYear()}
          </span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Privacy
          </a>
          <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Terms
          </a>
          <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Contact
          </a>
        </div>
      </div>
    </footer>
  )
}
