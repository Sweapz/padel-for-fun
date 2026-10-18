import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SharedAuth } from '../../auth/shared-auth';
import { safeReturnUrl } from '../../auth/auth-guard';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  readonly auth = inject(SharedAuth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly password = signal('');

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.password() || this.auth.busy()) return;

    const password = this.password();
    this.password.set('');
    const ok = await this.auth.signIn(password);

    if (ok)
      await this.router.navigateByUrl(
        safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
      );
  }

  setPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }
}
