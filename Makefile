preflight:
	./deploy/scripts/00_preflight.sh

secrets:
	./deploy/scripts/01_create_or_update_secrets.sh

aws-static:
	./deploy/scripts/02_create_ecr_and_security.sh

build-push:
	./deploy/scripts/03_build_push_local.sh

cert:
	./deploy/scripts/04_request_certificate_route53.sh

deploy:
	./deploy/scripts/05_deploy_stack.sh

dns:
	./deploy/scripts/06_create_route53_aliases.sh

outputs:
	./deploy/scripts/07_print_outputs.sh

github-role:
	./deploy/scripts/08_create_github_oidc_role.sh

github-values:
	./deploy/scripts/09_print_github_values.sh
