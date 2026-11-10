.PHONY: check release preview
check:
	python3 -m unittest discover -s tests -v
	node tests/model.test.mjs
	python3 -m compileall -q custom_components scripts
	node --check custom_components/thingslocal_dashboard/www/thingslocal-dashboard-card.js
	node --check preview/demo.js
	node --check tests/browser-checks.js
	bash -n scripts/install.sh
release: check
	python3 scripts/build_release.py
preview:
	python3 -m http.server 8096 --bind 127.0.0.1
