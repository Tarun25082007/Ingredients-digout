package com.digout.repositories;

import com.digout.models.User;
import com.digout.util.EmailUtils;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    Optional<User> findByCanonicalEmail(String canonicalEmail);

    default Optional<User> findByAnyEmail(String email) {
        if (email == null || email.isBlank()) {
            return Optional.empty();
        }
        String trimmed = email.trim().toLowerCase();
        Optional<User> user = findByEmail(trimmed);
        if (user.isPresent()) {
            return user;
        }
        String canonical = EmailUtils.canonicalize(trimmed);
        return findByCanonicalEmail(canonical);
    }
}
