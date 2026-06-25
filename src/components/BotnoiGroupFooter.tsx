import type { ReactNode } from "react";
import { Facebook, Linkedin, Youtube } from "lucide-react";

const SITE = "https://botnoigroup.com";

const companyLinks = [
  { label: "About us", href: `${SITE}/aboutus` },
  {
    label: "Academy",
    href: "https://web.facebook.com/botnoi.academy/?_rdc=1&_rdr",
  },
  { label: "Blog", href: `${SITE}/blog` },
  {
    label: "Careers",
    href: "https://www.linkedin.com/company/botnoi-group/jobs/",
  },
  { label: "Contact us", href: `${SITE}/contact` },
] as const;

const aiServiceLinks = [
  { label: "AI Chatbot", href: `${SITE}/ai/chatbot` },
  { label: "AI Voicebot", href: `${SITE}/ai/voicebot` },
  { label: "AI Digital Human", href: `${SITE}/ai/digitalhuman` },
  { label: "AI Text to Speech", href: `${SITE}/ai/texttospeech` },
  { label: "AI Speech to Text", href: `${SITE}/ai/speechtotext` },
  { label: "AI Computer Vision", href: `${SITE}/ai/computervision` },
] as const;

const toolLinks = [
  { label: "Botnoi Voice-TTS", href: "https://voice.botnoi.ai/" },
  { label: "AI Chatbot Platform", href: "https://botnoi.ai/" },
] as const;

const industryLinks = [
  { label: "Insurance", href: `${SITE}/business/insurance` },
  { label: "Education", href: `${SITE}/business/education` },
  { label: "Health & Medical", href: `${SITE}/business/health` },
  { label: "Bank & Financial", href: `${SITE}/business/financial` },
  { label: "Tourism & Hotel", href: `${SITE}/business/tourism` },
] as const;

const socialLinks = [
  {
    label: "Facebook",
    href: "https://web.facebook.com/botnoigroup",
    Icon: Facebook,
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@BOTNOIGROUP",
    Icon: Youtube,
  },
  {
    label: "LinkedIn",
    href: "https://th.linkedin.com/company/botnoi-group?trk=public_profile_experience-item_profile-section-card_image-click",
    Icon: Linkedin,
  },
] as const;

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className="block text-sm text-white/90 no-underline transition-colors hover:text-white/60"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

function ColumnTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-sm font-semibold tracking-tight text-white mb-4">
      {children}
    </h3>
  );
}

export function BotnoiGroupFooter() {
  return (
    <footer className="w-full border-t border-black/5 bg-black text-white">
      <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-10 xl:gap-16">
          <div className="shrink-0">
            <a
              href={SITE}
              className="inline-block opacity-100 transition-opacity hover:opacity-80"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="https://framerusercontent.com/images/TQrutj0p4YNkyOIn8INNJgujaA.svg?width=126&height=33"
                alt="Botnoi Group"
                width={126}
                height={33}
                className="h-8 w-auto"
              />
            </a>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <ColumnTitle>Company</ColumnTitle>
              <nav className="flex flex-col gap-3" aria-label="Company">
                {companyLinks.map(({ label, href }) => (
                  <FooterLink key={label} href={href}>
                    {label}
                  </FooterLink>
                ))}
              </nav>
            </div>

            <div>
              <ColumnTitle>
                AI Technology <span className="font-bold">Services</span>
              </ColumnTitle>
              <nav className="flex flex-col gap-3" aria-label="AI services">
                {aiServiceLinks.map(({ label, href }) => (
                  <FooterLink key={label} href={href}>
                    {label}
                  </FooterLink>
                ))}
              </nav>
              <h4 className="mt-8 text-sm font-semibold text-white mb-3">
                Human Resources
              </h4>
              <FooterLink href={`${SITE}/ai/data-science`}>
                Data Scientist
              </FooterLink>
            </div>

            <div>
              <ColumnTitle>Our AI Tools</ColumnTitle>
              <nav className="flex flex-col gap-3 mb-8" aria-label="AI tools">
                {toolLinks.map(({ label, href }) => (
                  <FooterLink key={label} href={href}>
                    {label}
                  </FooterLink>
                ))}
              </nav>
              <ColumnTitle>
                <span className="font-bold">Solutions by Industry</span>
              </ColumnTitle>
              <nav className="flex flex-col gap-3" aria-label="Industries">
                {industryLinks.map(({ label, href }) => (
                  <FooterLink key={label} href={href}>
                    {label}
                  </FooterLink>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-white">
            © 2017 Botnoi Group
          </p>
          <div className="flex items-center gap-4">
            {socialLinks.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="text-white transition-colors hover:text-white/60"
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
