/**
 * Match eligibility: a family may begin matching only after completing BOTH
 * the intake form and the home study. "Home study complete" means they either
 * reported an existing completed home study (path 'completed') or passed the
 * readiness screener — NOT_YET_ELIGIBLE and INTERNATIONAL outcomes stay
 * locked (the matching UI explains why).
 */
import type { User } from "../db/users";

export function homeStudyComplete(user: User): boolean {
  return (
    user.home_study_path === "completed" ||
    (user.home_study_path === "screener" && user.home_study_result === "PASSED")
  );
}

export function matchEligible(user: User): boolean {
  return user.intake_completed && homeStudyComplete(user);
}
