<%@ page language="java" contentType="application/json; charset=UTF-8" pageEncoding="UTF-8" trimDirectiveWhitespaces="true" %>
<%
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    session.removeAttribute("authenticated");
    session.removeAttribute("username");
    session.invalidate();
    out.print("{\"success\":true}");
%>
