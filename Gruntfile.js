/*
  == BSD2 LICENSE ==
  Copyright (c) 2014, Tidepool Project
  
  This program is free software; you can redistribute it and/or modify it under
  the terms of the associated License, which is identical to the BSD 2-Clause
  License as published by the Open Source Initiative at opensource.org.
  
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the License for more details.
  
  You should have received a copy of the License along with this program; if
  not, you can obtain one from Tidepool Project at tidepool.org.
  == BSD2 LICENSE ==


Gruntfile for dummy-api
*/

module.exports = function(grunt) {
  'use strict';

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
      },
      build: {
        src: 'src/<%= pkg.name %>.js',
        dest: 'build/<%= pkg.name %>.min.js'
      }
    },
    jshint: {
      options: {
        jshintrc: '.jshintrc'
      },
      all: ['env.js', 'Gruntfile.js', 'lib/**/*.js', 'test/**/*.js']
    },
    shell: {
      addlicense: {
        // this may not be the best way to do this dependency, but this isn't
        // a task we're going to run that often.
        command: 'python ../central/tools/addLicense.py "*/*.js"',
        options: {
          async: false,
          execOptions: {
            cwd: './lib/'
          }
        }
      }
    },
    mochaTest: {
      test: {
        options: {
          reporter: 'spec'
        },
        src: ['test/**/*.js']
      }
    }
  });

  // Load the plugins
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-shell-spawn');
  grunt.loadNpmTasks('grunt-mocha-test');

  // Default task(s).
  grunt.registerTask('default', ['jshint', 'docco', 'mochaTest']);
  grunt.registerTask('test', ['mochaTest']);

};
