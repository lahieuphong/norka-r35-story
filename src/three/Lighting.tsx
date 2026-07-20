import { ContactShadows, Environment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

interface Props { readonly isMobile: boolean; }
export function Lighting({ isMobile }: Props) {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const previous = scene.environmentIntensity;
    scene.environmentIntensity = 0.9;
    return () => { scene.environmentIntensity = previous; };
  }, [scene]);
  return (
    <>
      <Environment files="/hdr/automotive-studio.hdr" background={false} />
      <ambientLight intensity={0.1} />
      <directionalLight
        castShadow
        color="#fff7ed"
        intensity={2}
        position={[-4.5, 6.5, 5.5]}
        shadow-mapSize-width={isMobile ? 1024 : 2048}
        shadow-mapSize-height={isMobile ? 1024 : 2048}
        shadow-camera-near={0.5}
        shadow-camera-far={18}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.00015}
      />
      <directionalLight color="#8fa9ff" intensity={1.15} position={[5.5, 3.2, -4.5]} />
      <spotLight color="#a50e1d" intensity={22} distance={13} angle={0.52} penumbra={0.9} position={[-4.5, 2.1, -4.8]} />
      <rectAreaLight color="#ffffff" intensity={5} width={5.5} height={1.2} position={[0, 5.5, 1]} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#07080a" roughness={0.93} metalness={0.02} />
      </mesh>
      <ContactShadows position={[0, 0.012, 0]} scale={9} opacity={0.52} blur={isMobile ? 2.7 : 3.1} far={3.8} resolution={isMobile ? 512 : 1024} frames={1} />
    </>
  );
}
