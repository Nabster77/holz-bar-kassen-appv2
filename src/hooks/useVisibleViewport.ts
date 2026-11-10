import { useEffect, useState } from 'react';

/** The area actually visible above a mobile on-screen keyboard. */
export function useVisibleViewport() {
  const read = () => ({
    top: window.visualViewport?.offsetTop ?? 0,
    height: window.visualViewport?.height ?? window.innerHeight,
  });
  const [viewport, setViewport] = useState(read);

  useEffect(() => {
    const visual = window.visualViewport;
    const update = () => setViewport(read());
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return viewport;
}
