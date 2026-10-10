// Shared layout for the Privacy and Terms pages (linked from Google's OAuth
// Branding page, which needs public URLs for both).
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <article className="px-5 lg:px-0 pt-[max(1.75rem,env(safe-area-inset-top))] lg:pt-9 pb-12 flex flex-col gap-5 text-[15px] leading-relaxed text-soft [&_h2]:text-cream [&_h2]:font-bold [&_h2]:text-[17px] [&_h2]:mt-3 [&_strong]:text-cream [&_a]:text-honey [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        <div className="flex flex-col gap-1.5">
          <div className="font-mono text-[13px] text-muted">LAST UPDATED · {updated}</div>
          <h1 className="m-0 font-display font-extrabold text-[32px] lg:text-[40px] tracking-tight leading-none text-cream">
            {title}
          </h1>
        </div>
        {children}
      </article>
    </div>
  );
}
