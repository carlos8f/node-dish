test:
	@./node_modules/.bin/mocha \
		--reporter spec \
		--timeout 5s \
		--require test/common.js

.PHONY: test