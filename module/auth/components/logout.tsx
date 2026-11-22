"use client";
import { signOut, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

interface LogoutProps {
  children: React.ReactNode;
  className?: string;
}

function Logout({ children, className }: LogoutProps) {
  const router = useRouter();
  const { data: session } = useSession();

  async function handleOnClick() {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
        },
      },
    }, session);
  }
  return (
    <span className={className} onClick={() => handleOnClick()}>
      {children}
    </span>
  );
}

export default Logout;
