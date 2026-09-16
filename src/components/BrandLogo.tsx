/** The Movement's logo: the color version on light backgrounds, the white one on navy. */
export function BrandLogo({ variant = "color", className = "" }: { variant?: "color" | "white"; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={variant === "color" ? "/brand/meida-logo.png" : "/brand/meida-logo-white.png"}
      alt="התנועה לחופש המידע"
      width={255}
      height={63}
      className={className}
    />
  );
}
