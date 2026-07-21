import { ContactShadows, Environment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

interface Props { readonly isMobile: boolean; }
export function Lighting({ isMobile }: Props) {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const previous = scene.environmentIntensity;
    scene.environmentIntensity = 0.74;
    return () => { scene.environmentIntensity = previous; };
  }, [scene]);
  return (
    <>
      <Environment files="/hdr/automotive-studio.hdr" background={false} />
      <ambientLight intensity={0.32} />
      <directionalLight
        castShadow
        color="#ffffff"
        intensity={1.55}
        position={[6.5, 7.25, -8.5]}
        shadow-mapSize-width={isMobile ? 1024 : 2048}
        shadow-mapSize-height={isMobile ? 1024 : 2048}
        shadow-camera-near={0.5}
        shadow-camera-far={24}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.00008}
        shadow-normalBias={0.015}
        shadow-intensity={1}
        shadow-radius={isMobile ? 1.4 : 2.2}
      />
      <directionalLight color="#ffffff" intensity={0.82} position={[5.5, 3.2, -4.5]} />
      <spotLight color="#ffffff" intensity={2.8} distance={13} angle={0.52} penumbra={0.9} position={[-4.5, 2.1, -4.8]} />
      <rectAreaLight color="#ffffff" intensity={2.15} width={5.5} height={1.2} position={[0, 5.5, 1]} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#c1cbd3" roughness={0.97} metalness={0} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
        <planeGeometry args={[80, 80]} />
        <shadowMaterial transparent color="#182b39" opacity={isMobile ? 0.34 : 0.42} depthWrite={false} />
      </mesh>
      <ContactShadows color="#182a36" position={[0, 0.012, 0]} scale={[3.6, 6.8]} opacity={isMobile ? 0.44 : 0.5} blur={isMobile ? 2.8 : 3.2} far={0.75} resolution={isMobile ? 512 : 1024} frames={1} />
    </>
  );
}
