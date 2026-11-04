import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";
import { IconButton } from "./Button";
import styles from "./Header.module.css";

interface Props {
  title: string;
  /** Home has the big app title (h1) and no back button. */
  home?: boolean;
  /** Header width on desktop follows the page below it. */
  width?: "browse" | "study";
  /** Extra items after the title (progress, review button, menu). */
  children?: ReactNode;
}

export function Header({ title, home, width = "browse", children }: Props) {
  const navigate = useNavigate();
  const Title = home ? "h1" : "h2";
  return (
    <header className={cx(styles.header, !home && (width === "study" ? styles.study : styles.browse))}>
      {!home && (
        <IconButton aria-label="Назад" onClick={() => navigate("/")}>
          <Icon name="chevron-left" />
        </IconButton>
      )}
      <Title>{title}</Title>
      {children}
    </header>
  );
}
