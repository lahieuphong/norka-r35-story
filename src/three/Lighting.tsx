import { ContactShadows, Environment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

interface Props { readonly shadowResolution: 256 | 512; }
export function Lighting({ shadowResolution }: Props) {
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
        color="#ffffff"
        intensity={1.55}
        position={[6.5, 7.25, -8.5]}
      />
      <directionalLight color="#ffffff" intensity={0.82} position={[5.5, 3.2, -4.5]} />
      <spotLight color="#ffffff" intensity={2.8} distance={13} angle={0.52} penumbra={0.9} position={[-4.5, 2.1, -4.8]} />
      <rectAreaLight color="#ffffff" intensity={2.15} width={5.5} height={1.2} position={[0, 5.5, 1]} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#c1cbd3" roughness={0.97} metalness={0} />
      </mesh>
      <ContactShadows color="#182a36" position={[0, 0.012, 0]} scale={[3.6, 6.8]} opacity={0.48} blur={3} far={0.75} resolution={shadowResolution} frames={1} />
    </>
  );
}
