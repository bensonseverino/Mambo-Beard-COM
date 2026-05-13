import { useState } from "react";
import { Link } from "react-router-dom";
import footerSvg from "../assets/footer-01.svg";

const socialLinks = [
  { label: "WHATSAPP CHANNEL", href: "#whatsapp", isExternal: true },
  { label: "INSTAGRAM", href: "#instagram", isExternal: true },
  { label: "FACEBOOK", href: "#facebook", isExternal: true },
  { label: "TIKTOK", href: "#tiktok", isExternal: true },
  { label: "Terms", href: "/terms", isExternal: false },
  { label: "Privacy Policy", href: "/privacy", isExternal: false },
];

function MoveUpRightIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13 5H19V11" />
      <path d="M19 5L5 19" />
    </svg>
  );
}

export default function MamboBeardFooter() {
  const [clicked, setClicked] = useState(null);



  const handleClick = (label) => {
    setClicked(label);

    setTimeout(() => {
      setClicked(null);
    }, 220);
  };

  return (
    <footer
      className="w-full bg-[#f5fffa] overflow-hidden select-none mt-auto"
      // style={{ fontFamily: "'Bebas Neue', sans-serif" }}
    >
      {/* Footer SVG */}
      <div className="w-full flex justify-center px-0 py-0 pb-1">
        <img
          src={footerSvg}
          alt="Mambo Beard"
          className="w-full h-auto object-cover"
          style={{
            filter:
              "brightness(0) saturate(100%) invert(20%) sepia(30%) saturate(800%) hue-rotate(350deg) brightness(95%) contrast(90%)",
          }}
        />
      </div>
      {/* Social links row */}
      <div className="flex justify-between items-end px-3 pt-1  gap-1 flex-wrap">
        {socialLinks.map((link) => {
          const LinkComponent = link.isExternal ? "a" : Link;
          const linkProps = link.isExternal
            ? { href: link.href }
            : { to: link.href };

          return (
            <LinkComponent
              key={link.label}
              {...linkProps}
              onClick={() => handleClick(link.label)}
              className={`
                group
                flex
                items-center
                gap-1
                whitespace-nowrap
                no-underline
                leading-none
                tracking-wider
                text-[clamp(9px,1.3vw,16px)]
                transition-all
                duration-200
                active:scale-95
                ${clicked === link.label ? "opacity-70" : "opacity-100"}
              `}
              style={{
                color: "#43392f",
              }}
            >
              <span>{link.label}</span>

              <MoveUpRightIcon
                className="
                  transition-transform
                  duration-300
                  group-hover:translate-x-0.5
                  group-hover:-translate-y-0.5
                  group-active:scale-90
                "
                style={{ stroke: "#43392f" }}
              />
            </LinkComponent>
          );
        })}
      </div>

      {/* Footer SVG */}
      {/* <div className="w-full flex justify-center px-0 py-0">
        <img
          src={footerSvg}
          alt="Mambo Beard"
          className="w-full h-auto object-cover"
          style={{ filter: "invert(1) sepia(1) hue-rotate(30deg) saturate(0.5) brightness(0.7) backgroundColor: #43392f"   }}
        />
      </div> */}
    </footer>
  );
}
