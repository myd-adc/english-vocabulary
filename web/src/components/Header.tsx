import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";
import { IconButton } from "./Button";
import { Mark } from "./Mark";
import styles from "./Header.module.css";

interface Props {
  title: string;
  /** A tab's own screen: big title on a yellow swipe, no back button. */
  home?: boolean;
  /** Where the back button goes (default: the home screen). */
  back?: string;
  /** Extra items after the title (count, progress, menu). */
  children?: ReactNode;
}

export function Header({ title, home, back = "/", children }: Props) {
  const navigate = useNavigate();
  const Title = home ? "h1" : "h2";
  return (
    <header className={cx(styles.header, home && styles.home)}>
      {!home && (
        <IconButton aria-label="Назад" className={styles.back} onClick={() => navigate(back)}>
          <Icon name="chevron-left" size={24} />
        </IconButton>
      )}
      <Title>{home ? <Mark ink="yellow">{title}</Mark> : title}</Title>
      {children}
    </header>
  );
}
