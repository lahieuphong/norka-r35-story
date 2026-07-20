interface Props { readonly exploreActive: boolean; }
export function Header({ exploreActive }: Props) {
  return (
    <header className={`site-header${exploreActive ? ' is-muted' : ''}`} inert={exploreActive}>
      <a className="wordmark" href="#hero" aria-label="NORKA R35 — back to hero"><span>NORKA</span><strong>R35</strong></a>
      <nav aria-label="Story sections"><a href="#aerodynamics">Design</a><a href="#performance">Power</a><a href="#interior">Interior</a><a href="#explore">Explore</a></nav>
      <span className="header-index" aria-hidden="true">01—11</span>
    </header>
  );
}
